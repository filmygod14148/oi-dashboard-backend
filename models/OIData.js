const mongoose = require('mongoose');

const OIDataSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  data: {
    type: Object,
    required: true
  }
});

module.exports = mongoose.model('OIData', OIDataSchema);
