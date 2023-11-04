'use strict'

const { randomUUID } = require('crypto');
const { PeerRPCClient }  = require('grenache-nodejs-http');
const { PeerRPCServer }  = require('grenache-nodejs-http');
const Link = require('grenache-nodejs-link');

const {
  validateOrder,
  validateOrderBook,
  addOrderToOrderBook,
  addOrdersFromOrderBookToOrderBook,
  removeOrderFromOrderBook,
  updateOrderStatus,
} = require('./helpers');
const { removeExpiredOrders } = require('./utils/handleExpiredOrders');
const { orderMocks } = require('./utils/orderMocks');
const { findMatchingOrders, validateTradeRequest, getOrder } = require('./utils/matchingOrders');

const uuid = randomUUID();

const link = new Link({
  grape: 'http://127.0.0.1:30001'
});
link.start();


// We start both server and client type of connection
const server = new PeerRPCServer(link, {
  timeout: 300000
});

const port = 1024 + Math.floor(Math.random() * 1000);
const service = server.transport('server');

service.listen(port);
server.init();

const client = new PeerRPCClient(link, {});


link.announce('order_book', service.port, {});
link.startAnnouncing('order_book', service.port, {});

// Channel for direct communication with the peer
link.announce(uuid, service.port, {});

link.startAnnouncing(uuid, service.port, {});

client.init()

const localOrderBook = {};
const externalOrderBook = {};
let openTrades = [];


// TODO: When trading check local balance to make sure we
// are able to fullfill the trade

// Add an order to start some interaction between peers
setTimeout(() => {
  const order = orderMocks[0];
  order.owner = uuid;
  addOrderToOrderBook(localOrderBook, order);

  client.map('order_book', {
    peer: uuid,
    data: order,
    topic: 'new_order',
  }, { timeout: 10000});

}, 2500);

client.map('order_book', {
  peer: uuid,
  data: localOrderBook,
  topic: 'peer_joined',
})


// Need some service that will check validity of the order book, both local
// and external

let tradeEnabled = true;
const REMOVE_EXPIRED_ORDERS_INTERVAL_MS = 12000;
const MATCH_ORDERS_INTERVAL_MS = 10000;
// Check validity of orders and remove expired ones
setInterval(() => {
  tradeEnabled = false;
  removeExpiredOrders(externalOrderBook, new Date());
  removeExpiredOrders(localOrderBook, new Date());
  tradeEnabled = true;
}, REMOVE_EXPIRED_ORDERS_INTERVAL_MS);


// Check matching orders
setInterval(() => {
  const matchingOrders = findMatchingOrders(localOrderBook, externalOrderBook);
  if (matchingOrders.length > 0) {
    // Update status of my local order to locked
    // updateOrderStatus()
    for (const { localOrder, matchingOrder } of matchingOrders) {
      updateOrderStatus(localOrder.symbol, localOrder.id, 'locked', localOrderBook);

      // Notify the peer that you want to trade
      const tradeId = randomUUID();

      openTrades.push({
        tradeId,
        localOrder,
        matchingOrder,
        status: 'trade_request_sent',
      });

      client.request(matchingOrder.owner, {
        peer: uuid,
        data: {
          order: matchingOrder,
          amount: localOrder.amount,
          tradeId: randomUUID(),
        },
        topic: 'intent_to_trade',
      }, (err) => {
        if (err) {
          // TODO Handle errors by having some kind of a counter, that will handle failed requests
          // to the peer. Remove the order from missing peer in the externalOrderBook
          // updateOrderStatus(localOrder.symbol, localOrder.id, 'open', localOrderBook);
        }
      });
    }
  }
}, MATCH_ORDERS_INTERVAL_MS);


service.on('request', (rid, key, payload, handler) => {
  if (!payload) {
    return
  }
  
  if (!payload.topic || !payload.peer || !payload.data) {
    console.error(`Received invalid data ${JSON.stringify(payload)}`);
    return;
  }

  const { topic, peer, data } = payload;

  if (peer === uuid) {
    return;
  }


  switch (topic) {
    // Used to handle newly joined peers, and to receive orderbooks from all peers
    // after client has started
    case 'peer_joined':
    case 'peer_joined_ack': {
      // When a new peer joins, it sends its whole order book, so all the others will know its
      // order, and each peer will send its own orderbook by targeting the peer
      if (!validateOrderBook(data)) {
        console.error(`Received invalid order book from peer ${peer}. Orderbook: ${JSON.stringify(data)}`);
      }
      
      // Copy all the order from the received orderbook to the external orderbook
      addOrdersFromOrderBookToOrderBook(data, externalOrderBook);

      console.log('Updated external order book');
      // Send our orderbook to the per
      if (topic === 'peer_joined') {
        client.request(peer, {
          peer: uuid,
          data: localOrderBook,
          topic: 'peer_joined_ack',
        });

      }

      break;
    }
    case 'trade_declined': {
      const { tradeId } = data;

      if (!tradeId) {
        console.error(`Invalid trade_decline request ${JSON.stringify(data)}`);
        break;
      }
      const openTrade = openTrades.find(openTrade => openTrade.tradeId === tradeId);
      // Remove the initated trade from the open trades array
      openTrades = openTrades.filter(openTrade => openTrade.tradeId !== tradeId);

      if (openTrade) {
        updateOrderStatus(openTrade.symbol, openTrade.id, 'open', localOrderBook);
      }
    }

    case 'intent_to_trade': {
      console.log('DATA', data);
      if (!validateTradeRequest(data)) {
        console.error(`Invalid trade request ${JSON.stringify(data)}`);
        break;
      }
      const  { order, amount, tradeId } = data;
      
      if (!tradeEnabled) {
        // Decline the request
        // TODO: Handle error when sending theis request. If the peer goes offline
        // We want to make sure we update the status on our end, withot relying
        // on the response from the peer.
        client.request(peer, {
          peer: uuid,
          data: {
            tradeId,
          },
          topic: 'trade_declined',
        });
        break;
      }

      tradeEnabled = false;

      // Lock the local order
      const localOrder = getOrder(order.symbol, order.id, localOrderBook);
      
      if (localOrder.status !== 'open') {
        client.request(peer, {
          peer: uuid,
          data: {
            tradeId,
          },
          topic: 'trade_declined',
        });

        tradeEnabled = true;
        break;
      }

      updateOrderStatus(order.symbol, order.id, 'locked', localOrderBook);

      if (amount > localOrder.amount) {
        client.request(peer, {
          peer: uuid,
          data: {
            tradeId,
          },
          topic: 'trade_declined',
        });
        updateOrderStatus(order.symbol, order.id, 'open', localOrderBook);
        tradeEnabled = true;
        break;
      }


      // Notify peer that you are willing to trade
      client.request(peer, {
        peer: uuid,
        data: {
          tradeId,
          symbol,
        },
        topic: 'trade_accepted',
      });

      tradeEnabled = true;
      break;
    }

    case 'trade_accepted': {
      // Means that peer accepted the trade and started the process
      // We can start the process on our end
    }


    // Notify trading peer that our side of the trade is completed
    case 'trade_completed': {
      // If we are not yet done, once our part is complete we notify the peer
      // we are finished. They will wait some predefined time for our trade_completed signal

      // If we dont send the  trade_completed in time, they will cancel the trade

      // If we already completed our side of the trade, and receive trade_completed signal
      // we need to update the order book on our end. 

      // We will send the message to all our peers with that order is filled

      // Then if not whole order is filled, we will add a new order
      // by sending a new_order call, with amount remainder

      // TODO: validate data
      const  { symbol, tradeId } = data;

      const openTrade = openTrades.find(trade => trade.tradeId === tradeId);

      if (!openTrade) {
        // What happens if we completed the trade on our end, service crashed
        // and we receive trade_completed from the peer. 
        console.error('Received trade_completed but no open trade available?');
        break;
      }

      // Update local balance
      // const order = getOrder(openTrade.symbol, openTrade.id,)

      client.map('order_book', {
        peer: uuid,
        data: {
          order: openTrade.localOrder,
        },
        topic: 'order_filled',
      })


      // If there is difference betweem trade amount and closed order
      // Add new order
    }

    case 'cancel_trade': {
      // Each client will have a logic, that will check the status of open trades, and check if the trade duration
      // passed the threshold. If that happens, it means the other peer, didn't comlpete the trade in time.
      // so we will change the status of trade to closed and update our order book

      // Currently we have validUntil for each trade. This is used for opening the trade
      // and adding to the order book

      // When opening a new trade, we should agree betwen the peers on the trade duration after which if trade is
      // not completed, we go back to the state before we matched orders. We reopen the order, and remove
      // current trade from the list of open trades.
    }



    case 'order_removed': {
      const { symbol, id } = data;
      if (!symbol || !data) {
        console.error(`Invalid order_removed payload ${data}`);
        break;
      }

      removeOrderFromOrderBook(symbol, id, externalOrderBook);
      console.log('Order removed from external orderbook');
    }
    case 'order_filled': {
      const { symbol, id, status } = data;
      if (!symbol || !data || !status) {
        console.error(`Invalid order_removed payload ${data}`);
        break;
      }

      updateOrderStatus(symbol, id, status, externalOrderBook);
    }
    case 'new_order': {
      if (!validateOrder(data)) {
        console.error(`Received invalid order ${JSON.stringify(data)}`);
        break;
      }

      addOrderToOrderBook(externalOrderBook, data);
    }
  }

  handler.reply(null, { msg: 'ackg' })
})

process.on('uncaughtException', function(err) {
  console.log('Caught exception: ' + err);
});


process.once('SIGINT', function (code) {
  link.stop();
  process.exit(0);
});

process.once('SIGTERM', function (code) {
  link.stop();
  process.exit(0);
});

