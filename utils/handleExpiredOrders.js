function removeExpiredOrders(ordersBook, currentTime) {

  const symbols = Object.keys(ordersBook);

  if (symbols.length === 0) {
    return;
  }

  symbols.forEach(symbol => {
    const upToDateOrders = ordersBook[symbol].filter(order => new Date(order.validUntil > currentTime));
    ordersBook[symbol] = [...upToDateOrders];
  });

}

module.exports = {
  removeExpiredOrders
}