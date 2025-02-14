const express = require("express");
const mongoose = require("mongoose");
const qr = require("qrcode");
const path = require("path");
const crypto = require("crypto");
const QRModel = require("./models/QRModel");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI
const DB_NAME = process.env.DB_NAME
console.log("MONGO_URI:", process.env.MONGO_URI);


// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// Connect to MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Home Page (Form to generate QR Code)
app.get("/", (req, res) => {
    res.render("index", { qrCode: null, error: null });
});

// Generate QR Code & Save to MongoDB
app.post('/generate', async (req, res) => {
    const { rollNo, name, yearSemester, department, section } = req.body;

    if (!rollNo || !name || !yearSemester || !department || !section) {
        return res.render("index", { qrCode: null, error: "All fields are required!" });
    }

    // Unique hash for the user
    const userHash = crypto.createHash('sha256')
        .update(`${rollNo}-${name}-${yearSemester}-${department}-${section}`)
        .digest('hex');

    try {
        let existingQR = await QRModel.findOne({ userHash });

        if (existingQR) {
            return res.render("index", { qrCode: existingQR.qrCodeUrl, error: null });
        }

        // Generate QR Code
        const qrData = `Roll No: ${rollNo}\nName: ${name}\nYear & Semester: ${yearSemester}\nDepartment: ${department}\nSection: ${section}`;
        const qrCodeUrl = await qr.toDataURL(qrData);

        // Save QR Code in MongoDB
        await QRModel.create({ userHash, qrCodeUrl });

        res.render("index", { qrCode: qrCodeUrl, error: null });
    } catch (err) {
        console.error(err);
        res.render("index", { qrCode: null, error: "Error generating QR Code!" });
    }
});

// List all QR Codes
app.get("/list", async (req, res) => {
    try {
        const qrList = await QRModel.find();
        res.render("list", { qrList });
    } catch (error) {
        console.error(error);
        res.render("list", { qrList: [], error: "Error fetching QR codes." });
    }
});

// Scan QR Page
app.get('/scan', (req, res) => {
    res.render('scan');
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});