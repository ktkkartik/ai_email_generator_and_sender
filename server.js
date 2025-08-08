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

// Generate text using Groq AI
async function generateWithGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Missing GROQ_API_KEY in environment variables");

  const url = "https://api.groq.com/openai/v1/chat/completions";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile", // use model from docs, update if needed
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

  try {
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "No content generated";
  } catch (err) {
    const text = await res.text();
    console.error("Failed to parse JSON response from Groq API:", text);
    throw new Error("Invalid JSON response from Groq API");
  }
}

async function generateEmailSubject(prompt) {
  const subjectPrompt = `Generate a short, clear subject line for this email request:\n\n${prompt}`;
  return generateWithGroq(subjectPrompt);
}

async function generateEmailBody(prompt) {
  return generateWithGroq(prompt);
}

/* ---------- API ROUTES ---------- */

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
      return res.status(400).json({ error: "Missing recipients or body" });

    const GMAIL_USER = process.env.GMAIL_USER;
    const GMAIL_APP_PASS = process.env.GMAIL_APP_PASS;

    if (!GMAIL_USER || !GMAIL_APP_PASS) {
      return res.status(500).json({ error: "Gmail SMTP credentials missing in environment variables" });
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

/* Uncomment to enable this test route for debugging Groq API connectivity */

app.get("/api/test-groq", async (req, res) => {
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) return res.status(500).send("Missing GROQ_API_KEY");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "Hello, test" }],
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).send(`Error from Groq API: ${text}`);
    }

    const data = JSON.parse(text);
    res.json(data);
  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
});


const port = process.env.PORT || 3000;
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);
app.listen(port, () => {
  console.log(`AI Email Sender running on http://localhost:${port}`);
});
