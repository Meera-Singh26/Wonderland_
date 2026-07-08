// routes/payments.js

const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Listing = require("../models/listing");
const Order = require("../models/orders");
const wrapAsync = require("../utils/wrapAsync");

const DOMAIN = process.env.DOMAIN || "http://localhost:8080";


// ---------------- CREATE CHECKOUT SESSION ----------------

router.post(
  "/create-checkout-session",
  wrapAsync(async (req, res) => {

    const { listingId } = req.body;

    if (!listingId) {
      return res.status(400).send("Listing ID missing");
    }

    // get listing from database
    const listing = await Listing.findById(listingId);

    if (!listing) {
      return res.status(404).send("Listing not found");
    }

    const amount = Math.round((listing.price || 0) * 100);

    // create stripe session
    const session = await stripe.checkout.sessions.create({

      // "card" = debit/credit cards
      // "upi"  = UPI apps like GPay, PhonePe, Paytm (India only, currency must be INR)
      payment_method_types: ["card", "upi"],

      line_items: [
        {
          price_data: {
            currency: "inr",
            product_data: {
              name: listing.title,
              description: listing.description,
              images: [listing.image?.url].filter(Boolean),
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],

      mode: "payment",

      metadata: {
        listingId: String(listing._id),
      },

      success_url: `${DOMAIN}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${DOMAIN}/payments/cancel`,
    });


    // save order in DB (pending)
    await Order.create({
      listing: listing._id,
      stripeSessionId: session.id,
      amount: amount,
      currency: "inr",
      status: "pending",
    });


    // redirect user to Stripe checkout
    res.redirect(303,session.url);
  })
);



// ---------------- WEBHOOK (REAL-TIME PAYMENT CONFIRMATION) ----------------
// Stripe calls this endpoint directly from its own servers the moment a
// payment actually succeeds/fails — this does NOT depend on the user's
// browser redirecting back to /success, so it's the real source of truth.
// NOTE: app.js already mounts express.raw() for this exact path, so
// req.body here is a raw Buffer (required for signature verification).

router.post(
  "/webhook",
  async (req, res) => {

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log("❌ Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the events we care about
    switch (event.type) {

      case "checkout.session.completed": {
        const session = event.data.object;

        await Order.findOneAndUpdate(
          { stripeSessionId: session.id },
          {
            status: "paid",
            customerEmail: session.customer_details?.email || "",
          }
        );

        console.log("✅ Order marked paid via webhook:", session.id);
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object;

        await Order.findOneAndUpdate(
          { stripeSessionId: session.id },
          { status: "failed" }
        );

        console.log("⚠️ Order expired/cancelled:", session.id);
        break;
      }

      default:
        // ignore other event types
        break;
    }

    // Always acknowledge receipt quickly, or Stripe will keep retrying
    res.status(200).json({ received: true });
  }
);



// ---------------- SUCCESS PAGE ----------------
// This is just the UI the user lands on after paying. It is NOT the source
// of truth for payment status anymore — the webhook above already updates
// the DB in real time. Here we just re-check status to show the correct
// message immediately (in case the webhook hasn't landed within a second or two).

router.get(
  "/success",
  wrapAsync(async (req, res) => {

    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).send("Session ID missing");
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    res.render("payments/success", { session });

  })
);



// ---------------- CANCEL PAGE ----------------

router.get("/cancel", (req, res) => {
  res.render("payments/cancel");
});



module.exports = router;