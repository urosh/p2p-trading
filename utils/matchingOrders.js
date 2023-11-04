const { validateOrder } = require("../helpers");

function findMatchingOrders(localOrderBook, externalOrderBook) {
  const localSymbols = Object.keys(localOrderBook);
  const externalSymbols = Object.keys(externalOrderBook);

  if (localSymbols.length === 0 || externalSymbols.length === 0) {
    return [];
  }
  let matchingOrders = [];

  localSymbols.forEach(localSymbol => {
    if (!externalSymbols.includes(localSymbol)) {
      return;
    }

    localOrderBook[localSymbol].forEach(localOrder => {
      // Find matching order in external orderbook
      const matchingOrder = externalOrderBook[localSymbol].find(externalOrder => matchOrders(localOrder, externalOrder));

      if (matchingOrder) {
        matchingOrders.push({
          localOrder,
          matchingOrder,
        });
      }
    })
  });

  return matchingOrders;
}

function validateTradeRequest(data) {
  if (Number.isNaN(data.amount)) {
    return false;
  }

  if (!data.order) {
    return false;
  }

  if (!validateOrder(data.order)) {
    return false;
  }

  if (!data.tradeId) {
    return false;
  }

  return true;
}

function matchOrders(local, external) {
  if (local.status !== 'open') {
    return false;
  }

  if (local.orderType === external.orderType) {
    return false;
  }
  if (local.orderType === 'buy') {
    if (local.price < external.price) {
      return false;
    }
  } else {
    if (local.price > external.price) {
      return false;
    }
  }

  // Double check if not expired
  if (new Date(local.validUntil) < new Date()) {
    return false;
  }

  if (new Date(external.validUntil) < new Date()) {
    return false;
  }
  
  return true;
}

function getOrder(symbol, id, orderBook) {
  return orderBook[symbol].find(order => order.id === id);
}

module.exports = {
  findMatchingOrders,
  validateTradeRequest,
  matchOrders,
  getOrder,
}