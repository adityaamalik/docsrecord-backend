require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const sgMail = require("@sendgrid/mail");
const { Doctor } = require("../models/doctor");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const router = express.Router();

router.post("/orders", async (req, res) => {
  try {
    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET,
    });

    let amount;
    if (req.body.subscription === "yearly") {
      amount = 5000;
    } else if (req.body.subscription === "monthly") {
      amount = 500;
    }

    const options = {
      amount: amount * 100, // amount in smallest currency unit
      currency: "INR",
      receipt: Math.random() * 1000000,
    };

    const order = await instance.orders.create(options);

    if (!order) return res.status(500).send("Some error occured");

    res.json(order);
  } catch (error) {
    res.status(500).send(error);
  }
});

router.post("/success", async (req, res) => {
  try {
    // getting the details back from our font-end
    const {
      orderCreationId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      doctorId,
      subscription,
    } = req.body;

    // Creating our own digest
    // The format should be like this:
    // digest = hmac_sha256(orderCreationId + "|" + razorpayPaymentId, secret);
    const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET);

    shasum.update(`${orderCreationId}|${razorpayPaymentId}`);

    const digest = shasum.digest("hex");

    // comaparing our digest with the actual signature
    if (digest !== razorpaySignature)
      return res.status(400).json({ msg: "Transaction not legit!" });

    // THE PAYMENT IS LEGIT & VERIFIED
    // YOU CAN SAVE THE DETAILS IN YOUR DATABASE IF YOU WANT

    const nextPaymentDate = new Date();

    if (subscription === "monthly") {
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    } else {
      nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + 1);
    }

    Doctor.findByIdAndUpdate(
      doctorId,
      {
        payment_valid_till: nextPaymentDate,
      },
      { new: true }
    )
      .then((r) => {
        res.json({
          msg: "Payment Successful",
          orderId: razorpayOrderId,
          paymentId: razorpayPaymentId,
          doc: r,
        });
      })
      .catch((e) => {
        res.status(501).json({
          msg: "Payment successful, but some error occured in server. Contact support.",
        });
        console.log(e);
      });
  } catch (error) {
    res.status(500).send(error);
  }
});

module.exports = router;
