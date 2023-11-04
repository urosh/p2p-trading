const { randomUUID } = require('crypto');

const orderMocks = [
  {
    symbol: 'BTC/USD',
    orderType: 'buy',
    amount: 0.5,
    price: 51000.0,
    validUntil: '2023-11-15T12:00:00Z',
    id: randomUUID(),
    signature: 'add-signature',
    status: 'open',
  },
  {
    symbol: 'BTC/USD',
    orderType: 'sell',
    amount: 0.2,
    price: 50500.0,
    validUntil: '2023-11-15T12:00:00Z',
    id: randomUUID(),
    signature: 'add-signature',
    status: 'open',
  },
  {
    symbol: 'ETH/BTC',
    orderType: 'sell',
    amount: 2,
    price: 0.056,
    validUntil: '2023-11-05T12:00:00Z',
    id: randomUUID(),
    signature: 'add-signature',
    status: 'open',
  },
]

module.exports = {
  orderMocks,
}