const express = require("express");
const router = express.Router();

router.get("/overview", (_req, res) => {
  res.json({ activeCases: 0, upcomingDeadlines7d: 0, overdueInvoices: 0, openTickets: 0 });
});

module.exports = router;

