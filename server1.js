const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const path = require("path");
const crypto = require("crypto");
const qr = require("qrcode");
const QRModel = require("./models/QRModel");
const UserModel = require("./models/userModel");
require("dotenv").config();`
`

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://shivaprasadreddy:1234@cluster0.vvz94.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

console.log("MONGO_URI:", process.env.MONGO_URI);
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// Connect to MongoDB
mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// ✅ Middleware to check authentication
const authenticate = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.redirect("/signin");
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie("token");
        return res.redirect("/signin");
    }
};

// ✅ Home Page
app.get("/", (req, res) => {
    res.render("index", { qrCode: null, error: null });
});

app.get('/ads.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ads.txt'));
});
// ✅ Signup Route
app.get("/signup", (req, res) => res.render("signup"));

app.post("/signup", async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.render("signup", { error: "All fields are required!" });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await UserModel.create({ username, email, password: hashedPassword });
        res.redirect("/signin");
    } catch (error) {
        console.error(error);
        res.render("signup", { error: "Error creating account!" });
    }
});

// ✅ Signin Route
app.get("/signin", (req, res) => res.render("signin"));


app.post("/signin", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.render("signin", { error: "All fields are required!" });
    try {
        const user = await UserModel.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.render("signin", { error: "Invalid email or password!" });
        }
        const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
        res.cookie("token", token, { httpOnly: true });
        res.redirect("/scan");
    } catch (error) {
        console.error(error);
        res.render("signin", { error: "Error signing in!" });
    }
});

// ✅ Logout Route
app.get("/logout", (req, res) => {
    res.clearCookie("token");
    res.redirect("/signin");
});

// ✅ QR Code Generation
app.post("/generate", async (req, res) => {
    const { rollNo, name, college, yearSemester, department, section, whatsapp, email } = req.body;
    
    if (!rollNo || !name || !college || !yearSemester || !department || !section || !whatsapp || !email) {
        return res.render("index", { qrCode: null, error: "All fields are required!" });
    }
    
    try {
        const userHash = crypto.createHash("sha256").update(`${rollNo}-${name}-${college}-${yearSemester}-${department}-${section}-${whatsapp}-${email}`).digest("hex");
        
        let existingQR = await QRModel.findOne({ userHash });
        if (existingQR) {
            return res.render("index", { qrCode: existingQR.qrCodeUrl, error: null });
        }
        
        const qrData = `Roll No: ${rollNo}\nName: ${name}\nCollege: ${college}\nYear & Semester: ${yearSemester}\nDepartment: ${department}\nSection: ${section}\nWhatsApp: ${whatsapp}\nEmail: ${email}`;
        const qrCodeUrl = await qr.toDataURL(qrData);
        
        await QRModel.create({ userHash, qrCodeUrl });
        res.render("index", { qrCode: qrCodeUrl, error: null });
    } catch (err) {
        console.error(err);
        res.render("index", { qrCode: null, error: "Error generating QR Code!" });
    }
});



// ✅ List all QR Codes
app.get("/list", async (req, res) => {
    try {
        const qrList = await QRModel.find();
        res.render("list", { qrList });
    } catch (error) {
        console.error(error);
        res.render("list", { qrList: [], error: "Error fetching QR codes." });
    }
});

// ✅ Protected Scan QR Page
app.get("/scan", authenticate, (req, res) => res.render("scan"));

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
