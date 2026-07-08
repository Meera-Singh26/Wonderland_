const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderSchema = new Schema({
  listing: { type: Schema.Types.ObjectId, ref: 'Listing' },
  stripeSessionId: String,
  amount: Number,        // in cents
  currency: String,
  status: { type: String, default: 'pending' }, // pending, paid, failed
  customerEmail: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
