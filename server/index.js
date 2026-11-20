require('dotenv').config();
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json({ limit: '20kb' }));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true });
const productSchema = new mongoose.Schema({
  name: { type: String, required: true }, category: { type: String, required: true },
  price: { type: Number, required: true, min: 1 }, oldPrice: Number, color: String,
  badge: String, image: { type: String, required: true }, rating: { type: Number, default: 4.8 },
}, { timestamps: true });
const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, name: String, price: Number, quantity: Number }],
  amount: { type: Number, required: true }, currency: { type: String, default: 'INR' },
  razorpayOrderId: { type: String, required: true, unique: true }, razorpayPaymentId: String,
  status: { type: String, enum: ['created', 'paid'], default: 'created' },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const PORT = Number(process.env.PORT) || 4000;

function signToken(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
  return jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function requireAuth(request, response, next) {
  const authorization = request.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return response.status(401).json({ message: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('name email');
    if (!user) return response.status(401).json({ message: 'Your session has expired. Please sign in again.' });
    request.user = user;
    return next();
  } catch {
    return response.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}

app.get('/api/health', (_request, response) => response.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.get('/api/products', async (_request, response, next) => {
  try { response.json(await Product.find().sort({ createdAt: 1 }).lean()); }
  catch (error) { next(error); }
});

app.post('/api/auth/register', async (request, response, next) => {
  try {
    const name = typeof request.body.name === 'string' ? request.body.name.trim() : '';
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body.password === 'string' ? request.body.password : '';
    if (name.length < 2 || name.length > 80 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) {
      return response.status(400).json({ message: 'Enter a valid name and email. Passwords must be 8–128 characters.' });
    }
    const existing = await User.findOne({ email });
    if (existing) return response.status(409).json({ message: 'An account with this email already exists.' });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    return response.status(201).json({ token: signToken(user), user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) { return next(error); }
});

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const email = typeof request.body.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body.password === 'string' ? request.body.password : '';
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return response.status(401).json({ message: 'Email or password is incorrect.' });
    return response.json({ token: signToken(user), user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) { return next(error); }
});

app.get('/api/auth/me', requireAuth, (request, response) => response.json({ user: request.user }));

app.get('/api/payments/key', (_request, response) => {
  if (!process.env.RAZORPAY_KEY_ID) return response.status(503).json({ message: 'Razorpay is not configured yet.' });
  return response.json({ key: process.env.RAZORPAY_KEY_ID });
});

app.post('/api/payments/create-order', requireAuth, async (request, response, next) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return response.status(503).json({ message: 'Add your Razorpay API keys to the server environment to enable checkout.' });
    const items = Array.isArray(request.body.items) ? request.body.items : [];
    if (!items.length || items.length > 30) return response.status(400).json({ message: 'Your shopping bag is empty or has too many items.' });
    const quantities = new Map();
    for (const item of items) {
      const id = String(item.productId || '');
      const quantity = Number(item.quantity);
      if (!mongoose.isValidObjectId(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return response.status(400).json({ message: 'One or more items in your bag are invalid.' });
      quantities.set(id, (quantities.get(id) || 0) + quantity);
    }
    const products = await Product.find({ _id: { $in: [...quantities.keys()] } }).lean();
    if (products.length !== quantities.size) return response.status(400).json({ message: 'A product in your bag is no longer available.' });
    const lineItems = products.map((product) => ({ product: product._id, name: product.name, price: product.price, quantity: quantities.get(product._id.toString()) }));
    const totalPaise = lineItems.reduce((total, item) => total + item.price * item.quantity * 100, 0);
    if (totalPaise > 50000000) return response.status(400).json({ message: 'The order total is above the checkout limit.' });
    const gateway = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const gatewayOrder = await gateway.orders.create({ amount: totalPaise, currency: 'INR', receipt: `forma_${Date.now()}` });
    await Order.create({ user: request.user._id, items: lineItems, amount: totalPaise, razorpayOrderId: gatewayOrder.id });
    return response.status(201).json({ id: gatewayOrder.id, amount: gatewayOrder.amount, currency: gatewayOrder.currency });
  } catch (error) { return next(error); }
});

app.post('/api/payments/verify', requireAuth, async (request, response, next) => {
  try {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = request.body;
    if (![orderId, paymentId, signature].every((value) => typeof value === 'string' && value.length < 256)) return response.status(400).json({ message: 'Payment details are incomplete.' });
    const order = await Order.findOne({ razorpayOrderId: orderId, user: request.user._id });
    if (!order) return response.status(404).json({ message: 'Order not found.' });
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest();
    const provided = Buffer.from(signature, 'hex');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return response.status(400).json({ message: 'Payment signature could not be verified.' });
    order.razorpayPaymentId = paymentId; order.status = 'paid'; await order.save();
    return response.json({ ok: true, orderId: order._id });
  } catch (error) { return next(error); }
});

app.get('/api/orders', requireAuth, async (request, response, next) => {
  try { response.json(await Order.find({ user: request.user._id, status: 'paid' }).sort({ createdAt: -1 }).lean()); }
  catch (error) { next(error); }
});

app.use((error, _request, response, _next) => {
  console.error(error.message);
  if (error.code === 11000) return response.status(409).json({ message: 'An account with this email already exists.' });
  if (error.name === 'ValidationError') return response.status(400).json({ message: 'Please check the information and try again.' });
  if (error.name === 'JsonWebTokenError') return response.status(401).json({ message: 'Please sign in again.' });
  return response.status(500).json({ message: error.message?.includes('JWT_SECRET') ? error.message : 'Something went wrong. Please try again.' });
});

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/commerce_studio')
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error(`MongoDB connection failed: ${error.message}`));

app.listen(PORT, '0.0.0.0', () => console.log(`Forma API listening on http://localhost:${PORT}`));
