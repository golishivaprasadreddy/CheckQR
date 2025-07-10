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

// Debug environment variables
console.log("🔧 Environment Check:");
console.log("- JWT_SECRET exists:", !!JWT_SECRET);
console.log("- JWT_SECRET length:", JWT_SECRET ? JWT_SECRET.length : 0);
console.log("- MONGO_URI exists:", !!MONGO_URI);

console.log("🔗 Connecting to MongoDB...");

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 30000 })
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// Debug middleware to log cookies
app.use((req, res, next) => {
    console.log("🍪 Cookies received:", req.cookies);
    console.log("🌐 Request URL:", req.url);
    console.log("📍 User-Agent:", req.headers['user-agent']);
    next();
});

const authenticate = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        console.error("❌ No token found in cookies for URL:", req.url);
        console.error("🍪 All cookies:", req.cookies);
        console.error("📍 Headers:", req.headers.cookie || "No cookie header");
        return res.redirect("/signin");
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        console.log("✅ Authentication successful for user:", decoded.email);
        next();
    } catch (err) {
        console.error("❌ Invalid or expired token:", err.message);
        res.clearCookie("token", {
            httpOnly: true,
            secure: false,
            sameSite: 'lax'
        });
        return res.redirect("/signin");
    }
};

app.get("/", (req, res) => {
    // Check if user is authenticated
    const token = req.cookies.token;
    if (token) {
        try {
            jwt.verify(token, JWT_SECRET);
            return res.redirect("/scan"); // Redirect authenticated users to scan page
        } catch (err) {
            // Invalid token, continue to index page
        }
    }
    res.render("index", { qrCode: null, error: null });
});
app.get("/attendance", (req, res) => {
    res.render("attendance");
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

// Add a signin success route
app.get("/signin-success", authenticate, (req, res) => {
    res.send(`
        <h1>✅ Signin Successful!</h1>
        <p>Welcome ${req.user.email}!</p>
        <p><a href="/scan">Go to Scan Page</a></p>
        <p><a href="/test-cookies">Check Cookies</a></p>
        <script>
            console.log('Cookies in browser:', document.cookie);
            setTimeout(() => {
                window.location.href = '/scan';
            }, 2000);
        </script>
    `);
});

app.get("/signup", (req, res) => res.render("signup"));

app.post("/signup", async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;
    
    if (!username || !email || !password || !confirmPassword) {
        return res.render("signup", { error: "All fields are required!" });
    }
    
    if (password !== confirmPassword) {
        return res.render("signup", { error: "Passwords do not match!" });
    }
    
    try {
        // Check if user already exists
        const existingUser = await UserModel.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.render("signup", { error: "User already exists with this email or username!" });
        }
        
        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Create new user
        await UserModel.create({
            username,
            email,
            password: hashedPassword,
            files: []
        });
        
        console.log("✅ User created successfully:", email);
        res.redirect("/signin");
    } catch (error) {
        console.error("❌ Error creating user:", error);
        res.render("signup", { error: "Error creating user!" });
    }
});

app.post("/signin", async (req, res) => {
    console.log("🔐 Signin attempt:", req.body.email);
    const { email, password } = req.body;
    if (!email || !password) return res.render("signin", { error: "All fields are required!" });

    try {
        // Find user by email or username
        const user = await UserModel.findOne({ 
            $or: [{ email }, { username: email }] 
        });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            console.log("❌ Invalid credentials for:", email);
            return res.render("signin", { error: "Invalid email/username or password!" });
        }
        
        console.log("🔑 Creating JWT token for user:", user.email);
        console.log("🔧 JWT_SECRET being used:", JWT_SECRET ? "EXISTS" : "MISSING");
        
        const token = jwt.sign({ 
            id: user._id, 
            email: user.email, 
            username: user.username 
        }, JWT_SECRET, { expiresIn: "1h" });
        
        console.log("🍪 Token created successfully:", token ? "YES" : "NO");
        console.log("🍪 Token length:", token ? token.length : 0);
        console.log("🍪 Setting cookie with token:", token.substring(0, 20) + "...");
        
        // Set cookie with proper options - ONLY ONE METHOD
        res.cookie("token", token, { 
            httpOnly: true, 
            secure: false, // Set to true in production with HTTPS
            sameSite: 'lax',
            maxAge: 3600000, // 1 hour
            path: '/' // Ensure cookie is available for all paths
        });

        console.log("✅ Cookie set using res.cookie() method");
        console.log("✅ User Signed In:", user.email);
        console.log("🍪 About to redirect to /signin-success");
        
        // Instead of redirect, let's try a different approach
        // Add a small delay and check if we can read the cookie
        setTimeout(() => {
            console.log("⏰ Delayed check - cookies should be set now");
        }, 100);
        
        res.redirect("/signin-success");
    } catch (error) {
        console.error("❌ Error signing in:", error);
        res.render("signin", { error: "Error signing in!" });
    }
});

// Alternative signin route that doesn't redirect
app.post("/signin-test", async (req, res) => {
    console.log("🔐 Test Signin attempt:", req.body.email);
    const { email, password } = req.body;
    if (!email || !password) return res.json({ error: "All fields are required!" });

    try {
        // Find user by email or username
        const user = await UserModel.findOne({ 
            $or: [{ email }, { username: email }] 
        });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            console.log("❌ Invalid credentials for:", email);
            return res.json({ error: "Invalid email/username or password!" });
        }
        
        console.log("🔑 Creating JWT token for user:", user.email);
        const token = jwt.sign({ 
            id: user._id, 
            email: user.email, 
            username: user.username 
        }, JWT_SECRET, { expiresIn: "1h" });
        
        console.log("🍪 Setting cookie with token:", token.substring(0, 20) + "...");
        
        // Set cookie with proper options
        res.cookie("token", token, { 
            httpOnly: true, 
            secure: false,
            sameSite: 'lax',
            maxAge: 3600000,
            path: '/'
        });

        console.log("✅ User Signed In:", user.email);
        console.log("🍪 Cookie set, sending JSON response");
        
        // Send JSON response instead of redirect
        res.json({ 
            success: true, 
            message: "Signin successful",
            user: { email: user.email, username: user.username },
            redirectUrl: "/signin-success"
        });
    } catch (error) {
        console.error("❌ Error signing in:", error);
        res.json({ error: "Error signing in!" });
    }
});

// Simple signin test without redirect
app.get("/test-signin-simple", (req, res) => {
    res.send(`
        <h1>Simple Signin Test</h1>
        <form action="/test-signin-simple" method="POST">
            <input type="email" name="email" placeholder="Email" required><br><br>
            <input type="password" name="password" placeholder="Password" required><br><br>
            <button type="submit">Sign In</button>
        </form>
    `);
});

app.post("/test-signin-simple", async (req, res) => {
    console.log("🧪 Simple signin test for:", req.body.email);
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.send("Missing email or password");
    }

    try {
        const user = await UserModel.findOne({ 
            $or: [{ email }, { username: email }] 
        });
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.send("Invalid credentials");
        }
        
        const token = jwt.sign({ 
            id: user._id, 
            email: user.email, 
            username: user.username 
        }, JWT_SECRET, { expiresIn: "1h" });
        
        console.log("🍪 Setting cookie in simple test...");
        res.cookie("token", token, { 
            httpOnly: true, 
            secure: false,
            sameSite: 'lax',
            maxAge: 3600000,
            path: '/'
        });

        console.log("✅ Cookie set, sending response");
        res.send(`
            <h1>✅ Simple Signin Successful!</h1>
            <p>User: ${user.email}</p>
            <p><a href="/test-cookies">Check Cookies</a></p>
            <p><a href="/signin-success">Test Authentication Page</a></p>
        `);
    } catch (error) {
        console.error("❌ Simple signin error:", error);
        res.send("Error during signin");
    }
});

app.get("/logout", (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: false, // Set to true in production with HTTPS
        sameSite: 'lax',
        path: '/'
    });
    console.log("✅ User logged out");
    res.redirect("/signin");
});

// Test route to check cookies
app.get("/test-cookies", (req, res) => {
    console.log("🍪 Test - All cookies:", req.cookies);
    console.log("🍪 Test - Token cookie:", req.cookies.token || "NOT FOUND");
    res.json({
        cookies: req.cookies,
        token: req.cookies.token || "NOT FOUND",
        headers: req.headers.cookie || "No cookie header"
    });
});

// Test route to manually set a cookie
app.get("/test-set-cookie", (req, res) => {
    console.log("🧪 Setting test cookie...");
    res.cookie("testCookie", "testValue", {
        httpOnly: false, // Make it accessible via JavaScript for testing
        secure: false,
        sameSite: 'lax',
        maxAge: 3600000,
        path: '/'
    });
    res.send(`
        <h1>Test Cookie Set</h1>
        <p>A test cookie has been set. <a href="/test-cookies">Check cookies</a></p>
        <script>
            console.log('Document cookies:', document.cookie);
        </script>
    `);
});

// Test route to set httpOnly cookie like JWT
app.get("/test-set-httponly-cookie", (req, res) => {
    console.log("🧪 Setting httpOnly test cookie...");
    res.cookie("testHttpOnly", "httpOnlyValue", {
        httpOnly: true, // Same as JWT token
        secure: false,
        sameSite: 'lax',
        maxAge: 3600000,
        path: '/'
    });
    res.send(`
        <h1>HttpOnly Test Cookie Set</h1>
        <p>An httpOnly test cookie has been set. <a href="/test-cookies">Check cookies</a></p>
        <p>You won't see this cookie in document.cookie because it's httpOnly</p>
        <script>
            console.log('Document cookies (httpOnly will not appear):', document.cookie);
        </script>
    `);
});

// Test route to set a JWT token cookie
app.get("/test-set-jwt-cookie", (req, res) => {
    console.log("🧪 Setting JWT token cookie...");
    
    // Create a test JWT token
    const testToken = jwt.sign({ 
        id: "test123", 
        email: "test@example.com", 
        username: "testuser" 
    }, JWT_SECRET, { expiresIn: "1h" });
    
    console.log("🍪 Test JWT token created:", testToken.substring(0, 20) + "...");
    
    res.cookie("token", testToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 3600000,
        path: '/'
    });
    
    res.send(`
        <h1>JWT Token Cookie Set</h1>
        <p>A JWT token cookie has been set. <a href="/test-cookies">Check cookies</a></p>
        <p>Token preview: ${testToken.substring(0, 50)}...</p>
        <p><a href="/signin-success">Test Authentication</a></p>
    `);
});

app.post("/generate", async (req, res) => {
    const { rollNo, name, college, yearSemester, department, section, whatsapp, email } = req.body;

    if (!rollNo || !name || !college || !yearSemester || !department || !section || !whatsapp || !email) {
        return res.status(400).json({ error: "All fields are required!" });
    }

    try {
        const currentDate = new Date().toISOString().split("T")[0]; // e.g., "2025-07-01"

        const userHash = crypto
            .createHash("sha256")
            .update(`${rollNo}-${name}-${college}-${yearSemester}-${department}-${section}-${whatsapp}-${email}-${currentDate}`)
            .digest("hex");

        // Check if today's QR already exists
        let existingQR = await QRModel.findOne({ rollNo, date: currentDate });
        if (existingQR) {
            console.log(`ℹ️ QR Code already exists for Roll No: ${rollNo} on ${currentDate}`);
            return res.status(200).json({ qrCodeUrl: existingQR.qrCodeUrl });
        }

        const qrData = `Date: ${currentDate}\nRoll No: ${rollNo}\nName: ${name}\nCollege: ${college}\nYear & Semester: ${yearSemester}\nDepartment: ${department}\nSection: ${section}\nWhatsApp: ${whatsapp}\nEmail: ${email}`;
        const qrCodeUrl = await qr.toDataURL(qrData);

        // Save the QR code in the database
        await QRModel.create({
            rollNo,
            userHash,
            qrCodeUrl,
            date: currentDate, // ✅ Store today's date
        });

        console.log(`✅ QR Code Generated for Roll No: ${rollNo} on ${currentDate}`);
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

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

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
        const currentDate = new Date().toISOString().split("T")[0];

        for (let student of students) {
            try {
                // Check if today's QR exists
                const existingQR = await QRModel.findOne({ rollNo: student.rollNo, date: currentDate });
                if (existingQR) {
                    console.warn(`⚠️ QR already exists for Roll No: ${student.rollNo} on ${currentDate}`);
                    qrResults.push({ rollNo: student.rollNo, status: "skipped", error: "QR Code already exists for today" });
                    continue;
                }

                const qrData = `Date: ${currentDate}\nRoll No: ${student.rollNo}\nName: ${student.name}\nCollege: ${student.college}\nYear & Semester: ${student.yearSemester}\nDepartment: ${student.department}\nSection: ${student.section}\nWhatsApp: ${student.whatsapp}\nEmail: ${student.email}`;
                const qrCodeUrl = await qr.toDataURL(qrData);

                const userHash = crypto.createHash("sha256")
                    .update(`${student.rollNo}-${student.name}-${student.college}-${student.yearSemester}-${student.department}-${student.section}-${student.whatsapp}-${student.email}-${currentDate}`)
                    .digest("hex");

                await QRModel.create({
                    rollNo: student.rollNo,
                    userHash,
                    qrCodeUrl,
                    date: currentDate,
                });

                console.log(`✅ QR Code generated for Roll No: ${student.rollNo} on ${currentDate}`);
                qrResults.push({ rollNo: student.rollNo, status: "success", qrCodeUrl });
            } catch (err) {
                console.error(`❌ QR error for Roll No: ${student.rollNo}`, err.message);
                qrResults.push({ rollNo: student.rollNo, status: "error", error: err.message });
            }
        }

        for (let student of students) {
            try {
                const existingStudent = await StudentModel.findOne({ rollNo: student.rollNo });
                if (existingStudent) {
                    dbResults.push({ rollNo: student.rollNo, status: "skipped", error: "Student already exists" });
                    continue;
                }

                const batchYear = `20${student.rollNo.substring(0, 2)}`;
                const studentDataForDB = {
                    rollNo: student.rollNo,
                    name: student.name,
                    department: student.department,
                    college: student.college,
                    section: student.section,
                    batchYear: batchYear,
                };

                const savedStudent = await StudentModel.create(studentDataForDB);
                console.log(`✅ Student data saved for Roll No: ${student.rollNo}`);
                dbResults.push({ rollNo: student.rollNo, status: "success", data: savedStudent });
            } catch (err) {
                console.error(`❌ DB error for Roll No: ${student.rollNo}`, err.message);
                dbResults.push({ rollNo: student.rollNo, status: "error", error: err.message });
            }
        }

        res.status(200).json({
            message: "Excel processed successfully",
            date: currentDate,
            qrResults,
            dbResults,
        });
    } catch (err) {
        console.error("❌ Excel processing error:", err);
        res.status(500).send("❌ Server error during Excel processing.");
    } finally {
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
    const { eventName, batches, departments, rollNumbers } = req.body;

    // Log the received data for debugging
    console.log("Received data:", { eventName, batches, departments, rollNumbers });

    if (!eventName || !batches || !departments || !rollNumbers || !Array.isArray(rollNumbers)) {
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

        // Fetch students filtered by batches and departments
        const students = await StudentModel.find({
            batchYear: { $in: batches },
            department: { $in: departments },
        });

        console.log("Filtered students:", students);

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
app.get("/get-attendance", async (req, res) => {
    try {
        // Fetch all students with their attendance data
        const students = await StudentModel.find();

        // Format the data to include attendance for all events
        const attendanceData = students.map((student) => ({
            rollNo: student.rollNo,
            name: student.name,
            department: student.department,
            batchYear: student.batchYear,
            events: Object.fromEntries(student.events || []), // Convert Map to Object
        }));

        res.status(200).json({ attendanceData });
    } catch (error) {
        console.error("Error fetching attendance data:", error);
        res.status(500).json({ error: "Error fetching attendance data." });
    }
});
 
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
