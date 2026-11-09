const express = require("express");
const asyncHandler = require("../helpers/async-handler");
const { PrescriptionTemplate } = require("../models/prescription-template");
const { cleanMedicines } = require("./visits");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.send(
      await PrescriptionTemplate.find({ doctor: req.user.doctorId }).sort({
        name: 1,
      })
    );
  })
);

// Saving under an existing name replaces that template.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).send("Template name is required");

    const template = await PrescriptionTemplate.findOneAndUpdate(
      { doctor: req.user.doctorId, name },
      {
        medicines: cleanMedicines(req.body.medicines),
        advice: String(req.body.advice || ""),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(201).send(template);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const template = await PrescriptionTemplate.findOneAndDelete({
      _id: req.params.id,
      doctor: req.user.doctorId,
    });
    if (!template) return res.status(404).send("Template not found");
    res.send({ deleted: true });
  })
);

module.exports = router;
