require('dotenv').config();
const mongoose = require('mongoose');
const catalog = require('./catalog');

const productSchema = new mongoose.Schema({
  name: String, category: String, price: Number, oldPrice: Number, color: String, badge: String, image: String, rating: Number,
}, { timestamps: true });
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/commerce_studio';
  await mongoose.connect(uri);
  await Product.deleteMany({});
  await Product.insertMany(catalog);
  console.log(`Added ${catalog.length} products.`);
  await mongoose.disconnect();
}

seed().catch((error) => { console.error(error); process.exitCode = 1; });
