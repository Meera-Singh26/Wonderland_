require("dotenv").config();
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");

// Models
const Listing = require("./models/listing.js");

// Utils
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");

// Routes
const paymentRoutes = require("./routes/payments");

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

// Static + middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

// ⚠️ Stripe webhook requires raw body, must be mounted BEFORE json
app.use("/payments/webhook", express.raw({ type: "application/json" }));

// For all other routes, JSON + urlencoded
app.use(express.json());

// Database connection
const MONGO_URL =
  process.env.MONGO_URL || "mongodb://127.0.0.1:27017/wonderland";
main()
  .then(() => console.log("✅ Database connected"))
  .catch((err) => console.log("❌ DB connection error", err));

async function main() {
  await mongoose.connect(MONGO_URL);
}

// ---------------- Routes ----------------
// app.get("/", (req, res) => {
//   res.send("Hi, I am root");
// });
app.get("/", (req, res) => {
  res.redirect("/listings");
});


// Index
app.get("/listings", async (req, res) => {
  const allListings = await Listing.find({});
  res.render("listings/index.ejs", { allListings });
});

// New
app.get("/listings/new", (req, res) => {
  res.render("listings/new.ejs", { errorMessage: null, data: {} });
});

// Show
app.get("/listings/:id", async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  res.render("listings/show.ejs", { listing });
});

// Create

app.post(
  "/listings",
  wrapAsync(async (req, res) => {
    if (!req.body.listing) {
      throw new ExpressError("Invalid Listing Data", 400);
    }
    const newListing = new Listing(req.body.listing);

  
    if (!req.body.listing.image || req.body.listing.image.trim() === "") {
      newListing.image = "https://images.unsplash.com/photo-1571896349842-33c89424de2d?v=1"; 
    }

    await newListing.save();
    res.redirect("/listings");
  })
);

// Edit
app.get("/listings/:id/edit", async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  res.render("listings/edit.ejs", { listing });
});

// Update
app.put("/listings/:id", async (req, res) => {
  const { id } = req.params;
  await Listing.findByIdAndUpdate(id, { ...req.body.listing });
  res.redirect(`/listings/${id}`);
});

// Delete
app.delete("/listings/:id", async (req, res) => {
  const { id } = req.params;
  await Listing.findByIdAndDelete(id);
  res.redirect("/listings");
});

// ✅ Mount payment routes
app.use("/payments", paymentRoutes);

// Error handler
app.use((err, req, res, next) => {
  const { statusCode = 500, message = "Something went wrong" } = err;
  res.status(statusCode).render("error.ejs", { err });
});

if (require.main === module) {
  app.listen(8080, () => {
    console.log("🚀 Server running on port 8080 http://localhost:8080");
  });
}

module.exports = app;
