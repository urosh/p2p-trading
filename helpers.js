const SUPPORTED_PAIRS = [
  'BTC/USD',
  'ETH/BTC',
  'SOL/BTC',
  'XRP/BTC',
  'BTC/EUR',
  'BTC/GBP',
  'ETH/EUR',
  'ETH/USD',
  'ETH/SOL',
  'ETH/XRP',
]

function validateOrder(order) {
  
  const {
    symbol,
    orderType,
    amount,
    price,
    validUntil,
    owner,
    id,
    signature,
  } = order;

  if (!symbol) {
    return false;
  }

  if(!SUPPORTED_PAIRS.includes(symbol)) {
    return false;
  }

  if (!['buy', 'sell'].includes(orderType)) {
    return false;
  }

  if (Number.isNaN(amount)) {
    return false;
  }

  if (Number.isNaN(price)) {
    return false;
  }

  if (!validUntil) {
    return false
  }

  try {
    const validUntilDate = new Date(validUntil);
    if (validUntilDate < new Date()) {
      return false;
    }
  } catch (err) {
    return false;
  }

  if (!owner) {
    return false
  }

  if (typeof owner !== 'string') {
    return false;
  }

  if (!id) {
    return false;
  }

  if (typeof id !== 'string') {
    return false;
  }


  // TODO specify signature validation

return true;

}

function validateOrderBook (data) {
  const symbols = Object.keys(data);
  if (symbols.length === 0) {
    return true;
  }
  let orderBookValid = true;
  symbols.every(symbol => {
    let symbolOrdersValid = true;
    data[symbol].every(order => {
      if (!validateOrder(order)) {
        symbolOrdersValid = false;
        return false;
      }
    })

    if (!symbolOrdersValid) {
      orderBookValid = false;
      return false
    }
  });

  return orderBookValid;
}

function addOrderToOrderBook(orderBook, order) {
  if (!validateOrder(order)) {
    console.error(`Invalid order data ${order}`);
  }

  if (!orderBook[order.symbol]) {
    orderBook[order.symbol] = [order];
  } else {
    if (!orderBook[order.symbol].find(o => o.id === order.id)) {
      orderBook[order.symbol].push(order);
    }
  }
}

function addOrdersFromOrderBookToOrderBook(sourceOrdersBook, destinationOrdersBook) {
  Object.keys(sourceOrdersBook).forEach(symbol => {
    sourceOrdersBook[symbol].forEach(order => {
      addOrderToOrderBook(destinationOrdersBook, order)
    })
  }) 
}

function removeOrderFromOrderBook(symbol, id, orderBook) {
  if (!orderBook[symbol]) {
    return;
  }
  const updatedOrders = orderBook[symbol].filter(order => order.id !== id);
  
  orderBook[symbol] = [...updatedOrders];
}

function updateOrderStatus(symbol, id, status, orderBook) {
  if (!orderBook[symbol]) {
    return;
  }
  
  orderBook[symbol]= orderBook[symbol].map(order => {
    if (order.id !== id) {
      return order;
    }

    return {
      ...order,
      status,
    }
  });
}

module.exports = {
  validateOrder,
  validateOrderBook,
  addOrdersFromOrderBookToOrderBook,
  addOrderToOrderBook,
  removeOrderFromOrderBook,
  updateOrderStatus,
  SUPPORTED_PAIRS,
}