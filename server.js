const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const path = require("path");
const crypto = require("crypto");
const qr = require("qrcode");
const multer = require("multer");
const xlsx = require("xlsx");
const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config();

const QRModel = require("./models/QRModel");
const UserModel = require("./models/userModel");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "your-default-mongo-uri";
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

console.log("🔗 Connecting to MongoDB...");

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true , serverSelectionTimeoutMS: 30000 })
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

const authenticate = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        console.error("❌ No token found in cookies.");
        return res.redirect("/signin");
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        console.log("✅ Authentication successful for user:", decoded.email);
        next();
    } catch (err) {
        console.error("❌ Invalid or expired token:", err.message);
        res.clearCookie("token");
        return res.redirect("/signin");
    }
};

app.get("/", (req, res) => {
    res.render("index", { qrCode: null, error: null });
});

app.get("/get-qr", async (req, res) => {
    const { rollNo } = req.query;
    if (!rollNo) return res.json({ error: "Roll number is required" });

    try {
        const qrRecord = await QRModel.findOne({ rollNo });
        if (!qrRecord) return res.json({ error: "QR Code not found" });

        res.json({ qrCodeUrl: qrRecord.qrCodeUrl });
    } catch (error) {
        console.error("❌ Error fetching QR Code:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/fileupload", authenticate, async (req, res) => {
    try {
        console.log("✅ Authenticated user accessing /fileupload:", req.user);
        res.render("fileupload");
    } catch (error) {
        console.error("❌ Error rendering file upload page:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get("/signup", (req, res) => res.render("signup"));

app.post("/signup", async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.render("signup", { error: "All fields are required!" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await UserModel.create({ username, email, password: hashedPassword });
        console.log("✅ User Created:", email);
        res.redirect("/signin");
    } catch (error) {
        console.error("❌ Error creating user:", error);
        res.render("signup", { error: "Error creating account!" });
    }
});

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
      
        console.log("✅ User Signed In:", email);
        res.redirect("/scan");
    } catch (error) {
        console.error("❌ Error signing in:", error);
        res.render("signin", { error: "Error signing in!" });
    }
});

app.get("/logout", (req, res) => {
    res.clearCookie("token");
   res.redirect("/signin");
});

app.post("/generate", async (req, res) => {
    const { rollNo, name, college, yearSemester, department, section, whatsapp, email } = req.body;

    if (!rollNo || !name || !college || !yearSemester || !department || !section || !whatsapp || !email) {
        return res.render("index", { qrCode: null, error: "All fields are required!" });
    }

    try {
        const userHash = crypto.createHash("sha256").update(`${rollNo}-${name}-${college}-${yearSemester}-${department}-${section}-${whatsapp}-${email}`).digest("hex");

        let existingQR = await QRModel.findOne({ rollNo });
        if (existingQR) {
            console.log("ℹ️ QR Code already exists for Roll No:", rollNo);
            return res.render("index", { qrCode: existingQR.qrCodeUrl, error: null });
        }

        const qrData = `Roll No: ${rollNo}\nName: ${name}\nCollege: ${college}\nYear & Semester: ${yearSemester}\nDepartment: ${department}\nSection: ${section}\nWhatsApp: ${whatsapp}\nEmail: ${email}`;
        const qrCodeUrl = await qr.toDataURL(qrData);

        await QRModel.updateOne(
            { rollNo }, // Find by roll number
            { userHash, qrCodeUrl }, // Update data
            { upsert: true } // Insert if not found
        );
        
        // console.log("✅ QR Code Created:", { rollNo, userHash, qrCodeUrl });
        console.log("✅ QR Code Generated for Roll No:", rollNo);

        res.render("index", { qrCode: qrCodeUrl, error: null });
    } catch (err) {
        console.error("❌ Error generating QR Code:", err);
        res.render("index", { qrCode: null, error: "Error generating QR Code!" });
    }
});

app.get("/list", async (req, res) => {
    try {
        const qrList = await QRModel.find();
        res.render("list", { qrList });
    } catch (error) {
        console.error("❌ Error fetching QR codes:", error);
        res.render("list", { qrList: [], error: "Error fetching QR codes." });
    }
});

app.get("/scan", authenticate, (req, res) => res.render("scan"));

const upload = multer({ dest: "uploads/" });

app.post("/upload-excel", upload.single("file"), async (req, res) => {
    try {
        console.log("📂 Excel File Uploaded:", req.file.path);
        
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        for (let data of jsonData) {
            if (!data.rollNo) {
                console.warn("⚠️ Skipping entry without Roll No:", data);
                continue;
            }
            console.log("📤 Sending Data to /generate:", data);
            await axios.post("http://localhost:3000/generate", data);
        }

        res.send("✅ Excel uploaded & QR codes generated!");
    } catch (err) {
        console.error("❌ Error processing Excel file:", err);
        res.status(500).send("❌ Error processing Excel file.");
    }
});

app.post("/save-file-details", async (req, res) => {
    const { fileName, eventName, timestamp, email, fileData, fileType } = req.body;

    if (!fileName || !eventName || !timestamp || !email || !fileData || !fileType) {
        return res.status(400).send("All fields are required.");
    }

    try {
        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        console.log("Saving File Details:", { fileName, eventName, timestamp, fileData, fileType });

        // Add the file details to the user's `files` array
        user.files.push({ fileName, eventName, timestamp, fileData, fileType });
        await user.save();

        res.status(200).send("File saved successfully in the database!");
    } catch (error) {
        console.error("Error saving file in the database:", error);
        res.status(500).send("Error saving file in the database.");
    }
});

app.get("/stored-files", authenticate, async (req, res) => {
    try {
        const user = await UserModel.findOne({ email: req.user.email });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        res.render("stored-files", { files: user.files });
    } catch (error) {
        console.error("Error fetching stored files:", error);
        res.status(500).send("Error fetching stored files.");
    }
});

app.post("/delete-file/:id", authenticate, async (req, res) => {
    try {
        const user = await UserModel.findOne({ email: req.user.email });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        // Find the file by ID
        const file = user.files.id(req.params.id);
        if (!file) {
            return res.status(404).send("File not found.");
        }

        // Remove the file from the user's files array
        user.files.pull({ _id: req.params.id });

        // Save the updated user document
        await user.save({ validateModifiedOnly: true }); // Skip validation for unmodified fields

        res.redirect("/stored-files"); // Redirect back to the stored files page
    } catch (error) {
        console.error("Error deleting file:", error);
        res.status(500).send("Error deleting file.");
    }
});

app.post("/delete-file/:id", authenticate, async (req, res) => {
    try {
        const user = await UserModel.findOne({ email: req.user.email });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        // Find the file by ID
        const file = user.files.id(req.params.id);
        if (!file) {
            return res.status(404).send("File not found.");
        }

        // Remove the file from the user's files array
        user.files.pull({ _id: req.params.id });

        // Save the updated user document
        await user.save({ validateModifiedOnly: true }); // Skip validation for unmodified fields

        res.redirect("/stored-files"); // Redirect back to the stored files page
    } catch (error) {
        console.error("Error deleting file:", error);
        res.status(500).send("Error deleting file.");
    }
});

app.get("/download-file/:id", authenticate, async (req, res) => {
    try {
        const user = await UserModel.findOne({ email: req.user.email });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        // Find the file by ID
        const file = user.files.id(req.params.id);
        if (!file) {
            return res.status(404).send("File not found.");
        }

        // Convert Base64 data back to a buffer
        const buffer = Buffer.from(file.fileData, "base64");

        // Set headers and send the file
        res.setHeader("Content-Type", file.fileType);
        res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
        res.send(buffer);
    } catch (error) {
        console.error("Error downloading file:", error);
        res.status(500).send("Error downloading file.");
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
