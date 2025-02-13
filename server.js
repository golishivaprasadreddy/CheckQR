const express = require("express");
const mongoose = require("mongoose");
const qr = require("qrcode");
const path = require("path");
const QRModel = require("./models/QRModel");

const app = express();
const PORT = 3000;
const DB_NAME = "qrDB";  // Ensure correct case-sensitive database name

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// MongoDB Connection
mongoose.connect(`mongodb://127.0.0.1:27017/${DB_NAME}`)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Routes
app.get("/", (req, res) => {
    res.render("index", { qrCode: null, error: null });
});

// Generate QR Code and Save to MongoDB
app.post("/generate", async (req, res) => {
    const { text } = req.body;

    if (!text) {
        return res.render("index", { qrCode: null, error: "Text is required!" });
    }

    try {
        const qrImage = await qr.toDataURL(text);

        // Save to MongoDB (Avoid duplicates)
        await QRModel.findOneAndUpdate({ text }, { text }, { upsert: true });

        res.render("index", { qrCode: qrImage, error: null });
    } catch (error) {
        console.error(error);
        res.render("index", { qrCode: null, error: "Error generating QR code." });
    }
});

app.get('/scan', (req, res) => {
    res.render('scan'); // This will render views/scan.ejs
});

// List QR Codes from Database
app.get("/list", async (req, res) => {
    try {
        const qrList = await QRModel.find();
        res.render("list", { qrList });
    } catch (error) {
        console.error(error);
        res.render("list", { qrList: [], error: "Error fetching QR codes." });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
