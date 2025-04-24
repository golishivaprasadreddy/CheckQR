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
const fs = require("fs");
dotenv.config();

const QRModel = require("./models/QRModel");
const UserModel = require("./models/userModel");
const StudentModel = require("./models/StudentModel"); // Import the Student model
const EventModel = require("./models/EventModel");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const Ademail = process.env.Adminemail;

console.log("🔗 Connecting to MongoDB...");

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true, serverSelectionTimeoutMS: 30000 })
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
        return res.status(400).json({ error: "All fields are required!" });
    }

    try {
        const userHash = crypto.createHash("sha256").update(`${rollNo}-${name}-${college}-${yearSemester}-${department}-${section}-${whatsapp}-${email}`).digest("hex");

        // Check if a QR code already exists for the roll number
        let existingQR = await QRModel.findOne({ rollNo });
        if (existingQR) {
            console.log(`ℹ️ QR Code already exists for Roll No: ${rollNo}`);
            return res.status(200).json({ qrCodeUrl: existingQR.qrCodeUrl });
        }

        const qrData = `Roll No: ${rollNo}\nName: ${name}\nCollege: ${college}\nYear & Semester: ${yearSemester}\nDepartment: ${department}\nSection: ${section}\nWhatsApp: ${whatsapp}\nEmail: ${email}`;
        const qrCodeUrl = await qr.toDataURL(qrData);

        // Save the QR code in the database
        await QRModel.create({
            rollNo,
            userHash,
            qrCodeUrl,
        });

        console.log(`✅ QR Code Generated for Roll No: ${rollNo}`);
        res.status(201).json({ qrCodeUrl });
    } catch (err) {
        console.error("❌ Error generating QR Code:", err);
        res.status(500).json({ error: "Error generating QR Code!" });
    }
});

app.get("/list", authenticate, async (req, res) => {
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

        // Read the uploaded Excel file
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        // Filter and map the data to include only the required fields for QR generation
        const students = jsonData.map((data) => ({
            rollNo: data.rollNo || null,
            name: data.name || null,
            department: data.department || null,
            college: data.college || null,
            section: data.section || null,
            yearSemester: data.yearSemester || null,
            whatsapp: data.whatsapp || null,
            email: data.email || null,
        })).filter(student => student.rollNo && student.name && student.department && student.college && student.section);

        if (students.length === 0) {
            return res.status(400).send("❌ No valid data found in the Excel file.");
        }

        const qrResults = [];
        const dbResults = [];

        // Part 1: QR Code Generation
        for (let student of students) {
            try {
                // Check if the QR code already exists in the QRModel
                const existingQR = await QRModel.findOne({ rollNo: student.rollNo });
                if (existingQR) {
                    console.warn(`⚠️ QR Code already exists for Roll No: ${student.rollNo}`);
                    qrResults.push({ rollNo: student.rollNo, status: "skipped", error: "QR Code already exists" });
                    continue;
                }

                // Generate QR code data with full details
                const qrData = `Roll No: ${student.rollNo}\nName: ${student.name}\nCollege: ${student.college}\nYear & Semester: ${student.yearSemester}\nDepartment: ${student.department}\nSection: ${student.section}\nWhatsApp: ${student.whatsapp}\nEmail: ${student.email}`;
                const qrCodeUrl = await qr.toDataURL(qrData);

                // Generate userHash
                const userHash = crypto.createHash("sha256").update(`${student.rollNo}-${student.name}-${student.college}-${student.yearSemester}-${student.department}-${student.section}-${student.whatsapp}-${student.email}`).digest("hex");

                // Save the QR code in the QRModel
                await QRModel.create({
                    rollNo: student.rollNo,
                    userHash,
                    qrCodeUrl,
                });

                console.log(`✅ QR Code generated for Roll No: ${student.rollNo}`);
                qrResults.push({ rollNo: student.rollNo, status: "success", qrCodeUrl });
            } catch (err) {
                console.error(`❌ Error generating QR Code for Roll No: ${student.rollNo}`, err.message);
                qrResults.push({ rollNo: student.rollNo, status: "error", error: err.message });
            }
        }

        // Part 2: Database Storage
        for (let student of students) {
            try {
                // Check if the student already exists in the StudentModel
                const existingStudent = await StudentModel.findOne({ rollNo: student.rollNo });
                if (existingStudent) {
                    console.warn(`⚠️ Student already exists for Roll No: ${student.rollNo}`);
                    dbResults.push({ rollNo: student.rollNo, status: "skipped", error: "Student already exists" });
                    continue;
                }

                // Extract batch year from roll number
                const batchYear = `20${student.rollNo.substring(0, 2)}`;

                // Save only the required fields to the StudentModel
                const studentDataForDB = {
                    rollNo: student.rollNo,
                    name: student.name,
                    department: student.department,
                    college: student.college,
                    section: student.section,
                    batchYear: batchYear,
                };
                const savedStudent = await StudentModel.create(studentDataForDB);

                console.log(`✅ Student data saved in DB for Roll No: ${student.rollNo}`);
                dbResults.push({ rollNo: student.rollNo, status: "success", data: savedStudent });
            } catch (err) {
                console.error(`❌ Error saving student data for Roll No: ${student.rollNo}`, err.message);
                dbResults.push({ rollNo: student.rollNo, status: "error", error: err.message });
            }
        }

        res.status(200).json({
            message: "Excel processed",
            qrResults,
            dbResults,
        });
    } catch (err) {
        console.error("❌ Error processing Excel file:", err);
        res.status(500).send("❌ Error processing Excel file.");
    } finally {
        // Clean up the uploaded file
        fs.unlinkSync(req.file.path);
    }
});

app.post("/save-file-details", async (req, res) => {
    const { fileName, eventName, timestamp, email, fileData, fileType } = req.body;

    if (!fileName || !eventName || !timestamp || !email || !fileData || !fileType) {
        return res.status(400).send("All fields are required.");
    }

    try {
        // Find the authenticated user
        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        // Find or create the admin user
        let adminUser = await UserModel.findOne({ email: Ademail });

        console.log("Saving File Details:", { fileName, eventName, timestamp, fileData, fileType });

        // Add the file details to the authenticated user's `files` array
        user.files.push({ fileName, eventName, timestamp, fileData, fileType });
        await user.save();

        // Add the file details to the admin user's `files` array
        adminUser.files.push({ fileName, eventName, timestamp, fileData, fileType });
        await adminUser.save();

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

app.post("/mark-attendance", async (req, res) => {
    const { eventName, rollNumbers } = req.body;

    if (!eventName || !rollNumbers || !Array.isArray(rollNumbers)) {
        return res.status(400).json({ error: "Invalid request data." });
    }

    try {
        // Check if the event exists, create it if it doesn't
        let event = await EventModel.findOne({ eventName });
        if (!event) {
            event = await EventModel.create({ eventName });
        }

        // Prevent duplicate attendance marking
        if (event.attendanceMarked) {
            return res.status(400).json({ error: "Attendance already marked for this event." });
        }

        // Fetch all students from the database
        const students = await StudentModel.find();

        for (const student of students) {
            // Initialize the `events` map if it doesn't exist
            student.events = student.events || new Map();

            // Mark attendance for the event
            if (rollNumbers.includes(student.rollNo)) {
                student.events.set(eventName, "present");
            } else {
                student.events.set(eventName, "absent");
            }

            // Save the updated student document
            await student.save();
        }

        // Mark the event as completed
        event.attendanceMarked = true;
        await event.save();

        res.status(200).json({ message: "Attendance marked successfully." });
    } catch (error) {
        console.error("Error marking attendance:", error);
        res.status(500).json({ error: "Error marking attendance." });
    }
});

app.get("/test-event-creation", async (req, res) => {
    const eventName = "Test Event";

    try {
        let event = await EventModel.findOne({ eventName });
        if (!event) {
            event = await EventModel.create({ eventName });
            console.log(`✅ Event created: ${eventName}`); // Log the event name when created
        } else {
            console.log(`ℹ️ Event already exists: ${eventName}`); // Log if the event already exists
        }

        res.status(200).json({ event });
    } catch (error) {
        console.error("❌ Error creating event:", error);
        res.status(500).send("Error creating event.");
    }
});

app.get("/test-attendance-check", async (req, res) => {
    const eventName = "Test Event";

    try {
        let event = await EventModel.findOne({ eventName });
        if (!event) {
            event = await EventModel.create({ eventName });
        }

        if (event.attendanceMarked) {
            console.log(`ℹ️ Attendance already marked for event: ${eventName}`);
            return res.status(200).send("Attendance already marked.");
        }

        // Simulate marking attendance
        event.attendanceMarked = true;
        await event.save();
        console.log(`✅ Attendance marked for event: ${eventName}`);

        res.status(200).send("Attendance marked successfully.");
    } catch (error) {
        console.error("❌ Error checking attendance:", error);
        res.status(500).send("Error checking attendance.");
    }
});

app.get("/test-event-update", async (req, res) => {
    const eventName = "Test Event";

    try {
        let event = await EventModel.findOne({ eventName });
        if (!event) {
            return res.status(404).send("Event not found.");
        }

        event.attendanceMarked = true;
        await event.save();

        console.log(`✅ Event updated: ${eventName}`);
        res.status(200).send("Event updated successfully.");
    } catch (error) {
        console.error("❌ Error updating event:", error);
        res.status(500).send("Error updating event.");
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));