# Ecommerce Website

Forma is a responsive home and lifestyle storefront built with React, Node.js, Express, and MongoDB. It includes secure account registration and sign-in, a persistent shopping bag, server-priced checkout, and Razorpay payment verification.

**GitHub:** [das078141-hub/ecommerce-website](https://github.com/das078141-hub/ecommerce-website)

## Features

- User authentication with JWT sessions and bcrypt password hashing.
- Product catalog with category filters and search.
- Shopping cart saved in the browser between visits.
- Razorpay orders created and verified on the server.
- MongoDB models for users, products, and orders.
- Responsive storefront, account dialogs, and checkout drawer.

## Setup

Requirements: Node.js 18+, MongoDB, and (for live payments) Razorpay API credentials.

1. Copy `.env.example` to `.env` and set a long random `JWT_SECRET`, your MongoDB connection string, and Razorpay keys.
2. Install packages with `npm install` and `npm install --prefix client`.
3. Start MongoDB and seed the catalog with `npm run seed`.
4. Run `npm run dev` and visit [http://localhost:5173](http://localhost:5173).

The API runs on port 4000. Razorpay checkout requires a valid key pair; keep the key secret on the server and never expose it in the client.

## Project summary

- **User Authentication:** JWT and bcrypt-based user authentication and authorization. The 50% reduction in unauthorized access attempts is a supplied project metric and should be included in a portfolio only if supported by measured results.
- **Checkout Optimization:** Shopping cart and streamlined checkout using Razorpay for secure transactions.
- **Technologies:** React.js, Node.js, Express.js, MongoDB.
