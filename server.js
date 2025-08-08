import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";

dotenv.config();
const __dirname = path.resolve();
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Generate email body using Groq AI
async function generateWithGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Missing GROQ_API_KEY in env");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama3-8b-8192",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that writes professional emails.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Groq API error response:", errorText);
    throw new Error("Groq API error: " + errorText);
  }

  // Try to parse JSON safely
  let data;
  try {
    data = await res.json();
  } catch (e) {
    const text = await res.text();
    console.error("Failed to parse JSON from Groq response:", text);
    throw new Error("Invalid JSON response from Groq API");
  }

  return data.choices?.[0]?.message?.content?.trim() || "No content generated";
}

async function generateEmailSubject(prompt) {
  const subjectPrompt = `Generate a short, clear subject line for this email request:\n\n${prompt}`;
  return generateWithGroq(subjectPrompt);
}

async function generateEmailBody(prompt) {
  return generateWithGroq(prompt);
}

app.post("/api/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const [subject, emailBody] = await Promise.all([
      generateEmailSubject(prompt),
      generateEmailBody(`${prompt}\n\nInclude a closing line with 'Regards, Kartik'.`),
    ]);

    res.json({ subject, email: emailBody });
  } catch (err) {
    console.error("generate error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post("/api/send", async (req, res) => {
  try {
    const { recipients, subject, body } = req.body;
    if (!recipients || !body)
      return res.status(400).json({ error: "Missing fields" });

    const GMAIL_USER = process.env.GMAIL_USER;
    const GMAIL_APP_PASS = process.env.GMAIL_APP_PASS;

    if (!GMAIL_USER || !GMAIL_APP_PASS) {
      return res.status(500).json({ error: "Gmail SMTP credentials missing in env" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASS,
      },
    });

    const toList = recipients
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");

    const mailOptions = {
      from: GMAIL_USER,
      to: toList,
      subject: subject || "No subject",
      text: body,
      html: body.replace(/\n/g, "<br/>"),
    };

    await transporter.sendMail(mailOptions);

    res.json({ ok: true, message: "Email sent successfully via Gmail SMTP!" });
  } catch (err) {
    console.error("send error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

const port = process.env.PORT || 3000;
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.listen(port, () => {
  console.log(`AI Email Sender running on http://localhost:${port}`);
});
