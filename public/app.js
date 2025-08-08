const $ = (id) => document.getElementById(id);
const generateBtn = $("generate");
const sendBtn = $("send");
const statusEl = $("status");

async function api(path, data) {
  const res = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

generateBtn.onclick = async () => {
  statusEl.textContent = "Generating...";
  try {
    const prompt = $("prompt").value;
    if (!prompt) { statusEl.textContent = "Enter a prompt first."; return; }
    const r = await api("generate", { prompt });
    if (r.error) {
      statusEl.textContent = "Error: " + r.error;
      return;
    }
    // fill subject automatically with short first line heuristic
    const email = r.email || "";
    $("emailBody").value = email;
    const firstLine = email.split("\n").find(l => l.trim());
    if (firstLine) $("subject").value = firstLine.slice(0, 80);
    statusEl.textContent = "Generated — you may edit before sending.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Generate failed: " + err.message;
  }
};

sendBtn.onclick = async () => {
  statusEl.textContent = "Sending...";
  try {
    const recipients = $("recipients").value;
    const subject = $("subject").value;
    const body = $("emailBody").value;
    if (!recipients || !body) { statusEl.textContent = "Recipients and body are required."; return; }
    const r = await api("send", { recipients, subject, body });
    if (r.error) statusEl.textContent = "Send error: " + r.error;
    else statusEl.textContent = "Email sent successfully.";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Send failed: " + err.message;
  }
};
