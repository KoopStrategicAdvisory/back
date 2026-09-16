const express = require("express");
const jwt = require("jsonwebtoken");
const PreapprovedEmail = require("../models/PreapprovedEmail");
const router = express.Router();

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token" });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (!payload?.roles?.includes("ADMIN")) {
      return res.status(403).json({ message: "Se requiere rol ADMIN" });
    }
    req.user = payload;
    next();
  } catch (_e) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
}

// Crear/actualizar preaprobación
router.post("/preapprovals", requireAdmin, async (req, res) => {
  const { email, roles = ["USER"], daysValid = 30, invitedBy, notes } = req.body || {};
  if (!email) return res.status(400).json({ message: "email requerido" });
  const normalizedEmail = String(email).toLowerCase().trim();
  const expiresAt = daysValid ? new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000) : undefined;
  const doc = await PreapprovedEmail.findOneAndUpdate(
    { email: normalizedEmail },
    { email: normalizedEmail, roles, expiresAt, used: false, invitedBy, notes },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return res.status(201).json({
    ok: true,
    preapproval: { email: doc.email, roles: doc.roles, expiresAt: doc.expiresAt, used: doc.used },
  });
});

// Listado
router.get("/preapprovals", requireAdmin, async (_req, res) => {
  const items = await PreapprovedEmail.find().select("email roles expiresAt used createdAt");
  res.json({ items });
});

module.exports = router;