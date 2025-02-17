const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const path = require("path");
const UserModel = require("./models/userModel");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

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
    if (!token) {
        return res.redirect("/signin");
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie("token");
        return res.redirect("/signin");
    }
};

// ✅ Signup Route
app.get("/signup", (req, res) => {
    res.render("signup");
});
app.get("/", (req, res) => {
    res.render("index", { qrCode: null, error: null });
});

app.post("/signup", async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.render("signup", { error: "All fields are required!" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new UserModel({ username, email, password: hashedPassword });
        await user.save();
        res.redirect("/signin");
    } catch (error) {
        console.error(error);
        res.render("signup", { error: "Error creating account!" });
    }
});

// ✅ Signin Route
app.get("/signin", (req, res) => {
    res.render("signin");
});

app.post("/signin", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.render("signin", { error: "All fields are required!" });
    }

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

// ✅ Protected Dashboard Route
app.get("/scan", authenticate, (req, res) => {
    res.render("scan");
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
