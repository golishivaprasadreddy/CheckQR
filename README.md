

# CheckQR

A QR-Based Attendance Automation

## Overview

QR-Based Attendance Automation is a smart and efficient system designed to replace traditional paper-based attendance tracking with a QR code-based solution. This system enables users to generate unique QR codes for individuals, scan these codes to mark attendance, and manage attendance records efficiently.

## Features

- **QR Code Generation:** Generate unique QR codes for individuals.

- **QR Code Scanning:** Scan QR codes to mark attendance.

- **Real-Time Logging:** Attendance records are updated instantly.

- **Dashboard Analytics:** View attendance reports and insights.

- **Export Data:** Download attendance logs in PDF / Excel format.

- **Mobile & Web Compatibility:** Responsive design for easy access.

- **JWT Authentication:** Secure access to QR scanning and attendance marking.

## Installation

### Prerequisites

Ensure you have the following installed:

- Node.js
- MongoDB

### Steps

1. **Clone the Repository**

    ```sh
    git clone https://github.com/golishivaprasadreddy/CheckQR.git
    cd CheckQR
    ```

2. **Install Dependencies**

    ```sh
    npm install
    ```

3. **Set Up Environment Variables**

    Create a `.env` file and add the following:

    ```env
    PORT=
    DB_NAME=
    MONGO_URI=
    ```

4. **Run the Application**

    ```sh
    npm start  # or npm run dev
    ```

## Usage

1. **User Authentication:** Users must sign up and log in to access the system securely.
2. **Generate a QR Code:** Enter user details to generate a unique QR code.
3. **Scan QR Code:** Authenticated users can scan QR codes to mark attendance.
 
## Authentication with JWT

- **Signup & Login:** Users must create an account and log in to receive a JWT token.

- **Token Storage:** The token is stored in cookies and used for secure authentication.
- **Protected Routes:** QR scanning and attendance logging require a valid JWT token.

This ensures that only authorized users can scan QR codes and access attendance data securely.

