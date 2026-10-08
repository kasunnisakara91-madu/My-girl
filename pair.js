const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
// Set the path for fluent-ffmpeg to find the ffmpeg executable
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('baileyz');
const { title } = require('process');
const yts = require('yt-search');
const FormData = require('form-data');
const ffmpegStatic = require('ffmpeg-static');

// ---------------- CONFIG ----------------

const BOT_NAME_FANCY = 'MADUSHANKA MD MINI BOT';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['💙', '💖', '💜', '🧡', '💛', '🤍', '🖤', '❤️', '🔍 ', '✨', '💎'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/I7eReF73VGu4EU9kF9w4uS?mode=gi_t',
  RCD_IMAGE_PATH: 'https://i.ibb.co/pB4Y9PrD/c30081ff2ffb.jpg',
  NEWSLETTER_JID: '120363423916773660@newsletter',
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94756331255',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029Vb7p3UCCHDyocfEGm23f',
  BOT_NAME: 'MADUSHANKA MD MINI BOT',
  BOT_VERSION: '2.0.0V',
  OWNER_NAME: 'MADUSANKA',
  IMAGE_PATH: 'https://i.ibb.co/pB4Y9PrD/c30081ff2ffb.jpg',
  BOT_FOOTER: '> *© MADUSHANKA MD MINI BOT*',
  BUTTON_IMAGES: { ALIVE: 'https://i.ibb.co/pB4Y9PrD/c30081ff2ffb.jpg' }
};

// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://ransikavoice_db_user:Pv4nX6iyYaUPpg23@test.te0sgjd.mongodb.net/';
const MONGO_DB = process.env.MONGO_DB || 'MADUSHANKA_MD';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch (e) { }
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `${title}\n\n${content}\n\n> *${footer}*`;
}
function generateOTP() { return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp() { return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();

const socketCreationTime = new Map();

const otpStore = new Map();

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  const admins = await loadAdminsFromMongo();
  const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
  const botName = sessionConfig.botName || BOT_NAME_FANCY;
  const image = sessionConfig.logo || config.RCD_IMAGE_PATH;
  const caption = formatMessage(botName, `*📋 NUMBER:* ${number}\n*🕒STATUS:* ${groupStatus}\n*🕒 CONNECTED AT:* ${getSriLankaTimestamp()}`, botName);
  for (const admin of admins) {
    try {
      const to = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
      if (String(image).startsWith('http')) {
        await socket.sendMessage(to, { image: { url: image }, caption });
      } else {
        try {
          const buf = fs.readFileSync(image);
          await socket.sendMessage(to, { image: buf, caption });
        } catch (e) {
          await socket.sendMessage(to, { image: { url: config.RCD_IMAGE_PATH }, caption });
        }
      }
    } catch (err) {
      console.error('Failed to send connect message to admin', admin, err?.message || err);
    }
  }
}

async function sendOwnerConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  try {
    const ownerNumbers = ['94787940686', '94779357798'];
    const activeCount = activeSockets.size;
    const botName = sessionConfig.botName || BOT_NAME_FANCY;
    const image = sessionConfig.logo || config.RCD_IMAGE_PATH;
    const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
    const caption = formatMessage(`*🥷 OWNER CONTACT: ${botName}*`, `*📋 NUMBER:* ${number}\n*🕒STATUS:* ${groupStatus}\n*🕒 CONNECTED AT:* ${getSriLankaTimestamp()}\n\n*ðŸ”¢ ACTIVE SESSIONS:* ${activeCount}`, botName);

    for (const ownerNum of ownerNumbers) {
      const ownerJid = `${ownerNum}@s.whatsapp.net`;
      if (String(image).startsWith('http')) {
        await socket.sendMessage(ownerJid, { image: { url: image }, caption });
      } else {
        try {
          const buf = fs.readFileSync(image);
          await socket.sendMessage(ownerJid, { image: buf, caption });
        } catch (e) {
          await socket.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
        }
      }
    }
  } catch (err) { console.error('Failed to send owner connect message:', err); }
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`*🔍  OTP VERIFICATION — ${BOT_NAME_FANCY}*`, `*YOUR OTP FOR CODE CONFIG UPDATE IS:* *${otp}*\nTHIS OTP WILL EXPIRE IN 5 MINUTES.\n\n*NUMBER:* ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo(); // array of {jid, emojis}
      const reactConfigs = await listNewsletterReactsFromMongo(); // [{jid, emojis}]
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}


// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

    try {
      // Load user-specific config from MongoDB
      let userEmojis = config.AUTO_LIKE_EMOJI; // Default emojis
      let autoViewStatus = config.AUTO_VIEW_STATUS; // Default from global config
      let autoLikeStatus = config.AUTO_LIKE_STATUS; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config

      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};

        // Check for emojis in user config
        if (userConfig.AUTO_LIKE_EMOJI && Array.isArray(userConfig.AUTO_LIKE_EMOJI) && userConfig.AUTO_LIKE_EMOJI.length > 0) {
          userEmojis = userConfig.AUTO_LIKE_EMOJI;
        }

        // Check for auto view status in user config
        if (userConfig.AUTO_VIEW_STATUS !== undefined) {
          autoViewStatus = userConfig.AUTO_VIEW_STATUS;
        }

        // Check for auto like status in user config
        if (userConfig.AUTO_LIKE_STATUS !== undefined) {
          autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
        }

        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      }

      // Use auto view status setting (from user config or global)
      if (autoViewStatus === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.readMessages([message.key]);
            break;
          } catch (error) {
            retries--;
            await delay(1000 * (config.MAX_RETRIES - retries));
            if (retries === 0) throw error;
          }
        }
      }

      // Use auto like status setting (from user config or global)
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, {
              react: { text: randomEmoji, key: message.key }
            }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) {
            retries--;
            await delay(1000 * (config.MAX_RETRIES - retries));
            if (retries === 0) throw error;
          }
        }
      }

    } catch (error) {
      console.error('Status handler error:', error);
    }
  });
}


async function handleMessageRevocation(socket, number) {
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys || keys.length === 0) return;
    const messageKey = keys[0];
    const userJid = jidNormalizedUser(socket.user.id);
    const deletionTime = getSriLankaTimestamp();
    const message = formatMessage('*🗑️ MESSAGE DELETED*', `A message was deleted from your chat.\n*📋 FROM:* ${messageKey.remoteJid}\n*🕒DELETION TIME:* ${deletionTime}`, BOT_NAME_FANCY);
    try { await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: message }); }
    catch (error) { console.error('Failed to send deletion notification:', error); }
  });
}


async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}


// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = `${config.OWNER_NUMBER}`;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isOwner = isbot ? isbot : developers.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");


    let body = (type === 'conversation') ? msg.message.conversation
      : msg.message?.extendedTextMessage?.contextInfo?.hasOwnProperty('quotedMessage')
        ? msg.message.extendedTextMessage.text
        : (type == 'interactiveResponseMessage')
          ? msg.message.interactiveResponseMessage?.nativeFlowResponseMessage
          && JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson)?.id
          : (type == 'templateButtonReplyMessage')
            ? msg.message.templateButtonReplyMessage?.selectedId
            : (type === 'extendedTextMessage')
              ? msg.message.extendedTextMessage.text
              : (type == 'imageMessage') && msg.message.imageMessage.caption
                ? msg.message.imageMessage.caption
                : (type == 'videoMessage') && msg.message.videoMessage.caption
                  ? msg.message.videoMessage.caption
                  : (type == 'buttonsResponseMessage')
                    ? msg.message.buttonsResponseMessage?.selectedButtonId
                    : (type == 'listResponseMessage')
                      ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
                      : (type == 'messageContextInfo')
                        ? (msg.message.buttonsResponseMessage?.selectedButtonId
                          || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
                          || msg.text)
                        : (type === 'viewOnceMessage')
                          ? msg.message[type]?.message[getContentType(msg.message[type].message)]
                          : (type === "viewOnceMessageV2")
                            ? (msg.msg.message.imageMessage?.caption || msg.msg.message.videoMessage?.caption || "")
                            : '';
    body = String(body || '');

    if (!body || typeof body !== 'string') return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    if (!command) return;

    try {

      // Load user config for work type restrictions
      const sanitized = (number || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};

      // ========== ADD WORK TYPE RESTRICTIONS HERE ==========
      // Apply work type restrictions for non-owner users
      if (!isOwner) {
        // Get work type from user config or fallback to global config
        const workType = userConfig.WORK_TYPE || 'public'; // Default to public if not set

        // If work type is "private", only owner can use commands
        if (workType === "private") {
          console.log(`Command blocked: WORK_TYPE is private for ${sanitized}`);
          return;
        }

        // If work type is "inbox", block commands in groups
        if (isGroup && workType === "inbox") {
          console.log(`Command blocked: WORK_TYPE is inbox but message is from group for ${sanitized}`);
          return;
        }

        // If work type is "groups", block commands in private chats
        if (!isGroup && workType === "groups") {
          console.log(`Command blocked: WORK_TYPE is groups but message is from private chat for ${sanitized}`);
          return;
        }

        // If work type is "public", allow all (no restrictions needed)
      }
      // ========== END WORK TYPE RESTRICTIONS ==========


      switch (command) {
        case 'addadmin': {
          if (!isOwner) return await socket.sendMessage(sender, { text: '❌ This command is only for the bot owner.' }, { quoted: msg });
          const target = args[0] ? args[0].replace(/[^0-9]/g, '') : (msg.message?.extendedTextMessage?.contextInfo?.participant || '').split('@')[0];
          if (!target) return await socket.sendMessage(sender, { text: '❌ Please mention a user or provide a number.' }, { quoted: msg });
          await addAdminToMongo(target);
          await socket.sendMessage(sender, { text: `✅ Added @${target} as an admin.`, mentions: [`${target}@s.whatsapp.net`] }, { quoted: msg });
          break;
        }
        case 'deladmin': {
          if (!isOwner) return await socket.sendMessage(sender, { text: '❌ This command is only for the bot owner.' }, { quoted: msg });
          const target = args[0] ? args[0].replace(/[^0-9]/g, '') : (msg.message?.extendedTextMessage?.contextInfo?.participant || '').split('@')[0];
          if (!target) return await socket.sendMessage(sender, { text: '❌ Please mention a user or provide a number.' }, { quoted: msg });
          await removeAdminFromMongo(target);
          await socket.sendMessage(sender, { text: `✅ Removed @${target} from admins.`, mentions: [`${target}@s.whatsapp.net`] }, { quoted: msg });
          break;
        }
        case 'listadmin': {
          const admins = await loadAdminsFromMongo();
          if (!admins || admins.length === 0) return await socket.sendMessage(sender, { text: 'ℹ️ No admins configured yet.' }, { quoted: msg });
          let list = '*⭐ ADMIN LIST ⭐*\n\n';
          admins.forEach((admin, i) => {
            list += `${i + 1}. @${admin.split('@')[0]}\n`;
          });
          await socket.sendMessage(sender, { text: list, mentions: admins.map(a => a.includes('@') ? a : `${a}@s.whatsapp.net`) }, { quoted: msg });
          break;
        }
        case 'xnxx': {
          try {
            const query = args.join(' ');
            const sanitized = (sender || '').replace(/[^0-9]/g, '');
            let cfg = typeof loadUserConfigFromMongo === 'function' ? await loadUserConfigFromMongo(sanitized) : {};
            let botName = cfg.botName || '_*MADUSHANKA MD MINI BOT*_';

            // --- UI Templates ---
            const uiTitle = "--- XNXX ---";
            const footer = `© ${botName} • 2026`;

            if (!query) {
              return await socket.sendMessage(sender, {
                text: `╔═══  *⚠️ SYSTEM NOTICE* ═══╗\n│\n│ 🧬 *Usage:* .xnxx <query/url>\n│ ⚡ *Example:* .xnxx sri lanka\n│\n╚════════════════════╝`
              }, { quoted: msg });
            }

            await socket.sendMessage(sender, { react: { text: '🔍', key: msg.key } });

            // --- බාà¶œත à¶šà·’රà·“මà·š List à¶‘à¶š යà·€න Function à¶‘à¶š (Case à¶‘à¶š à¶‡තà·”à·…à·š) ---
            const sendDownloadMenu = async (vUrl, vTitle, quoted) => {
              const sections = [{
                title: "💿 ASSET RECOVERY",
                rows: [
                  { title: "🎬 VIDEO (MP4)", rowId: `dl_1|${vUrl}`, description: "High Quality Stream" },
                  { title: "🎵 AUDIO (MP3)", rowId: `dl_2|${vUrl}`, description: "Audio Extraction" },
                  { title: "📂 DOCUMENT", rowId: `dl_3|${vUrl}`, description: "Binary File Format" }
                ]
              }];

              const dlList = {
                text: `\n📦 *CONTENT IDENTIFIED*\n\n📌 *Title:* ${vTitle}\n\nSelect the transmission format below:`,
                footer: footer,
                title: uiTitle,
                buttonText: "📥 DOWNLOAD",
                sections
              };

              const sentDl = await socket.sendMessage(sender, dlList, { quoted: quoted });

              // බාà¶œත à¶šà·’රà·“මà·š තà·šරà·“ම à·ƒඳà·„ා Listener à¶‘à¶š
              const dlListener = async ({ messages }) => {
                const r = messages[0];
                if (!r.message || r.key.remoteJid !== sender) return;
                const selId = r.message.listResponseMessage?.singleSelectReply?.selectedRowId;
                const isReply = r.message.listResponseMessage?.contextInfo?.stanzaId === sentDl.key.id;

                if (isReply && selId?.startsWith('dl_')) {
                  socket.ev.off('messages.upsert', dlListener);
                  const [_, format, targetUrl] = selId.split('|');
                  await socket.sendMessage(sender, { react: { text: '⏳', key: r.key } });

                  try {
                    let { data: dlData } = await axios.get(`https://18-apis.vercel.app/api/adult/xnxx/dl?url=${encodeURIComponent(targetUrl)}`);
                    const finalUrl = dlData.download_url || dlData.direct_link;

                    if (format === '1') await socket.sendMessage(sender, { video: { url: finalUrl }, caption: `✅ *COMPLETED:* ${vTitle}` }, { quoted: r });
                    else if (format === '2') await socket.sendMessage(sender, { audio: { url: finalUrl }, mimetype: 'audio/mpeg' }, { quoted: r });
                    else if (format === '3') await socket.sendMessage(sender, { document: { url: finalUrl }, mimetype: 'video/mp4', fileName: `${vTitle}.mp4` }, { quoted: r });

                    await socket.sendMessage(sender, { react: { text: '✅', key: r.key } });
                  } catch {
                    await socket.sendMessage(sender, { text: '❌ *Download error.*' }, { quoted: r });
                  }
                }
              };
              socket.ev.on('messages.upsert', dlListener);
              setTimeout(() => socket.ev.off('messages.upsert', dlListener), 300000);
            };

            // --- à·ƒà·™à·€à·”මà·Š à¶šà·Šâ€රà·’යාà·€ලà·’ය (Search / URL Check) ---
            if (query.includes('xnxx.com/video-')) {
              return await sendDownloadMenu(query.trim(), "XNXX Content", msg);
            }

            let { data: searchData } = await axios.get(`https://18-apis.vercel.app/api/adult/xnxx/search?q=${encodeURIComponent(query)}&page=1`);
            if (!searchData.success || !searchData.results?.length) return await socket.sendMessage(sender, { text: '❌ *No results found.*' });

            const results = searchData.results.slice(0, 15);
            const rows = results.map((res, i) => ({
              title: `${i + 1}. ${res.title.substring(0, 35)}...`,
              rowId: `sel_${i}`,
              description: `🕒 Duration: ${res.duration || 'N/A'}`
            }));

            const searchList = {
              text: `\n🧬 *DATABASE SCAN COMPLETE*\n\nQuery: "${query}"\n\nChoose a file to proceed:`,
              footer: footer,
              title: uiTitle,
              buttonText: "🔎 VIEW RESULTS",
              sections: [{ title: "AVAILABLE STREAMS", rows }]
            };

            const sentSearch = await socket.sendMessage(sender, searchList, { quoted: msg });

            // à·ƒà·™à·€à·”මà·Š පà·Šâ€රතà·’ඵල තà·šරà·“ම à·ƒඳà·„ා Listener à¶‘à¶š
            const searchListener = async ({ messages }) => {
              const r = messages[0];
              if (!r.message || r.key.remoteJid !== sender) return;
              const selId = r.message.listResponseMessage?.singleSelectReply?.selectedRowId;
              const isReply = r.message.listResponseMessage?.contextInfo?.stanzaId === sentSearch.key.id;

              if (isReply && selId?.startsWith('sel_')) {
                socket.ev.off('messages.upsert', searchListener);
                const index = parseInt(selId.split('_')[1]);
                const selected = results[index];
                await sendDownloadMenu(selected.url, selected.title, r);
              }
            };

            socket.ev.on('messages.upsert', searchListener);
            setTimeout(() => socket.ev.off('messages.upsert', searchListener), 300000);

          } catch (e) {
            console.error(e);
            await socket.sendMessage(sender, { text: '⚠️ *System Failure.*' });
          }
        }
          break;
        case 'font': {
          try {
            const text = args.join(' ').trim();
            if (!text) return await socket.sendMessage(sender, { text: '⚠️ කරුණාකර වෙනස් කිරීමට අවශ්‍ය වචනය හෝ වාක්‍යය ලබා දෙන්න.' });

            // සෙවුම් ප්‍රතිචාරය (Reaction)
            await socket.sendMessage(sender, { react: { text: '✍️', key: msg.key } });

            // API එකට Request එක යැවීම
            const res = await axios.get(`https://chama-api-hub.vercel.app/api/tools/fancy?apikey=chama_mini_api&text=${encodeURIComponent(text)}`);

            if (!res.data || res.data.status !== true) {
              return await socket.sendMessage(sender, { text: '❌ මට සමාවෙන්න, එම පෙළ වෙනස් කිරීමට නොහැකි වුණා.' });
            }

            const styles = res.data.result;

            // පණිවිඩය සැකසීම
            let fancyMsg = `*💖 FANCY TEXTER 💖*\n\n`;
            fancyMsg += `*♥️ NON FONT* ${text}\n\n`;
            fancyMsg += `◈━━━━━━━━━━━━━━◈\n`;

            // ලැබෙන සෑම style එකක්ම ලැයිස්තුවකට එකතු කිරීම
            styles.forEach((style) => {
              fancyMsg += `*┃◗ ${style.name.replace(/_/g, ' ').toUpperCase()}:*\n\`${style.result}\` \n\n`;
            });

            fancyMsg += `> _*𝙈𝘼𝘿𝙐𝙎𝙃𝘼𝙉𝙆𝘼 𝙈𝘿 𝙈𝙄𝙉𝙄 𝘽𝙊𝙏*_`;

            // අවසාන පණිවිඩය යැවීම
            await socket.sendMessage(sender, { text: fancyMsg }, { quoted: msg });

            // සාර්ථක ප්‍රතිචාරය (Reaction)
            await socket.sendMessage(sender, { react: { text: '✔', key: msg.key } });

          } catch (err) {
            console.error(err);
            await socket.sendMessage(sender, { text: `❌ ERROR: ${err.message}` });
          }
        }
          break;


        case 'menu': {
          try {
            await socket.sendMessage(sender, {
              react: { text: "📂", key: msg.key }
            });

            let userCfg = {};
            const cleanNumber = (number || '').replace(/[^0-9]/g, '');

            if (cleanNumber && typeof loadUserConfigFromMongo === 'function') {
              userCfg = await loadUserConfigFromMongo(cleanNumber) || {};
            }

            const MENU_IMG = "https://i.ibb.co/pB4Y9PrD/c30081ff2ffb.jpg";
            const OWNER_NAME = 'MADUSANKA';
            const BOT_NAME =
              userCfg.botName || 'MADUSHANKA MD MINI BOT';

            const userTag = `@${sender.split("@")[0]}`;
            const menuText = `
◈━━━━━━━━━━━━━━◈
       *${BOT_NAME}*
◈━━━━━━━━━━━━━━◈
│ 👤 Owner : ${OWNER_NAME}
│ 👤 Hey : ${userTag}
◈━━━━━━━━━━━━━━◈
│ 🔍  SELECT YOUR MENU
│
│ 🔍  DOWNLOAD MENU
│ 🎨 CREATIVE MENU
│ 📦 TOOLS MENU
◈━━━━━━━━━━━━━━◈
┌──────────────┐
│ 🚀 THE BETA BOT PROJECT
└──────────────┘
◈━━━━━━━━━━━━━━◈
> _*${BOT_NAME}*_
> 📍 Please select a menu below:
◈━━━━━━━━━━━━━━◈
`.trim();

            // BUTTON LIST
            const buttons = [
              {
                buttonId: 'menu_select',
                buttonText: {
                  displayText: 'MAIN MENU 🇱🇰'
                },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'CLICK HERE',
                    sections: [
                      {
                        title: `MENU COLLECTION 🎨`,
                        rows: [
                          {
                            title: '⛩️ Download Menu',
                            description: 'More download options',
                            id: `${config.PREFIX}download`
                          },
                          {
                            title: '🎨 Creative Menu',
                            description: 'Creative tools',
                            id: `${config.PREFIX}creative`
                          },
                          {
                            title: '📦 Tools Menu',
                            description: 'System tools',
                            id: `${config.PREFIX}tools`
                          },
                          {
                            title: '⛩️ Group Manager',
                            description: 'Group management tools',
                            id: `${config.PREFIX}group_menu`
                          },
                          {
                            title: '⚙️ Advanced Tools',
                            description: 'Native WhatsApp features',
                            id: `${config.PREFIX}adv_menu`
                          },
                          {
                            title: '📢 Channel Manager',
                            description: 'WhatsApp Newsletter tools',
                            id: `${config.PREFIX}channel_menu`
                          }
                        ]
                      }
                    ]
                  })
                }
              }
            ];

            const buttonMessage = {
              image: { url: MENU_IMG },
              caption: menuText,
              buttons: buttons,
              headerType: 4
            };

            await socket.sendMessage(
              sender,
              buttonMessage,
              { quoted: msg }
            );

            // ================= HANDLER =================

            const menuHandler = async (msgUpdate) => {
              try {
                const received = msgUpdate.messages?.[0];
                if (!received) return;

                if (received.key.remoteJid !== sender) return;

                let selectedId;

                const params =
                  received.message?.interactiveResponseMessage
                    ?.nativeFlowResponseMessage?.paramsJson;

                if (params) {
                  const parsed = JSON.parse(params);
                  selectedId = parsed.id;
                }

                if (!selectedId) return;

                await socket.sendMessage(sender, {
                  react: { text: "✅", key: received.key }
                });

                // ================= DOWNLOAD =================

                if (selectedId === `${config.PREFIX}download`) {

                  const downloadButtons = [
                    {
                      buttonId: 'download_select',
                      buttonText: {
                        displayText: 'DOWNLOAD OPTIONS 🎧'
                      },
                      type: 4,
                      nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                          title: 'Select Your Download',
                          sections: [
                            {
                              title: 'Download Options 🎧',
                              rows: [
                                {
                                  title: 'SONG',
                                  description: 'Download AUDIO',
                                  id: `${config.PREFIX}song`,
                                  highlight_label: 'SONG'
                                },
                                {
                                  title: 'VIDEO',
                                  description: 'Download VIDEO',
                                  id: `${config.PREFIX}video`,
                                  highlight_label: 'VIDEO'
                                },
                                {
                                  title: 'FACEBOOK',
                                  description: 'Download FB',
                                  id: `${config.PREFIX}fb`,
                                  highlight_label: 'FB'
                                },
                                {
                                  title: 'INSTAGRAM',
                                  description: 'Download INSTA',
                                  id: `${config.PREFIX}insta`,
                                  highlight_label: 'INSTA'
                                },
                                {
                                  title: 'TIKTOK',
                                  description: 'Download TIKTOK',
                                  id: `${config.PREFIX}tiktok`,
                                  highlight_label: 'HOT'
                                },
                                {
                                  title: 'MEDIAFIRE',
                                  description: 'Download MEDIAFIRE',
                                  id: `${config.PREFIX}mf`,
                                  highlight_label: 'NEW'
                                },
                                {
                                  title: 'APK',
                                  description: 'Download APK',
                                  id: `${config.PREFIX}apk`,
                                  highlight_label: 'APK'
                                },
                                {
                                  title: 'SPOTIFY',
                                  description: 'Download SPOTIFY',
                                  id: `${config.PREFIX}splotify`,
                                  highlight_label: 'SONG'
                                }
                              ]
                            }
                          ]
                        })
                      }
                    }
                  ];

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
----------------------------------------
┃ 🎧 *DOWNLOAD MENU*
========================================
________________________________________
Select a download option below.
________________________________________
========================================
> ${BOT_NAME}
----------------------------------------
`,
                    buttons: downloadButtons,
                    headerType: 4
                  }, { quoted: received });

                }

                // ================= CREATIVE =================

                if (selectedId === `${config.PREFIX}creative`) {

                  const downloadButtons = [
                    {
                      buttonId: 'creative_select',
                      buttonText: {
                        displayText: 'Creative Options'
                      },
                      type: 4,
                      nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                          title: 'Select Creative Option',
                          sections: [
                            {
                              title: 'Creative Menu 🌿',
                              rows: [
                                {
                                  title: 'IMG FOUNDER',
                                  description: 'FIND YOUR IMG',
                                  id: `${config.PREFIX}img`
                                },
                                {
                                  title: 'GENERATOR',
                                  description: 'GENERATE IMAGE',
                                  id: `${config.PREFIX}aiimg`
                                },
                                {
                                  title: 'CONVERT TO FANCY',
                                  description: 'TURN TO THE FANCY',
                                  id: `${config.PREFIX}font`
                                },
                                {
                                  title: 'CALCULATOR',
                                  description: 'CALCULATE NUMBERS',
                                  id: `${config.PREFIX}calc`
                                },
                                {
                                  title: 'TRANSLATOR',
                                  description: 'TRANSLATE THE WORD',
                                  id: `${config.PREFIX}tr`
                                },
                                {
                                  title: 'WEATHER',
                                  description: 'FIND THE WEATHER',
                                  id: `${config.PREFIX}weather`
                                },
                                {
                                  title: 'GIT HELPER',
                                  description: 'FIND YOUR GIT',
                                  id: `${config.PREFIX}git`
                                }
                              ]
                            }
                          ]
                        })
                      }
                    }
                  ];

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
----------------------------------------
┃ ☘️ *CREATIVE MENU*
========================================
________________________________________
Select a creative option below.
________________________________________
========================================
> ${BOT_NAME}
----------------------------------------
`,
                    buttons: downloadButtons,
                    headerType: 4
                  }, { quoted: received });

                }

                // ================= TOOLS =================

                if (selectedId === `${config.PREFIX}tools`) {

                  const downloadButtons = [
                    {
                      buttonId: 'tools_select',
                      buttonText: {
                        displayText: 'Tools Options'
                      },
                      type: 4,
                      nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                          title: 'Select Your Tools',
                          sections: [
                            {
                              title: 'Tools Options',
                              rows: [
                                {
                                  title: 'MENU',
                                  description: 'BACK TO MENU',
                                  id: `${config.PREFIX}menu`
                                },
                                {
                                  title: 'SETTING',
                                  description: 'SET YOUR SETUP',
                                  id: `${config.PREFIX}set`
                                },
                                {
                                  title: 'ALIVE',
                                  description: 'BOT SYSTEM ARE ONLINE',
                                  id: `${config.PREFIX}alive`
                                },
                                {
                                  title: 'PING',
                                  description: 'BOT SPEED AND ONLINE',
                                  id: `${config.PREFIX}ping`
                                },
                                {
                                  title: 'SYSTEM',
                                  description: 'VIEW THE SYSTEM INFO',
                                  id: `${config.PREFIX}system`
                                },
                                {
                                  title: 'TAGALL',
                                  description: 'TAG ALL MEMBERS',
                                  id: `${config.PREFIX}tagall`
                                },
                                {
                                  title: 'HIDETAG',
                                  description: 'TAG ALL ON HIDDEN',
                                  id: `${config.PREFIX}hidetag`
                                }
                              ]
                            }
                          ]
                        })
                      }
                    }
                  ];

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
----------------------------------------
┃ ❄️ *TOOLS MENU*
========================================
________________________________________
Select a tools option below.
________________________________________
========================================
> ${BOT_NAME}
----------------------------------------
`,
                    buttons: downloadButtons,
                    headerType: 4
                  }, { quoted: received });

                }

                // ================= GROUP MANAGER =================

                if (selectedId === `${config.PREFIX}group_menu`) {

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
◈━━━━━━━━━━━━━━◈
┃ ⛩️  GROUP MANAGER
◈━━━━━━━━━━━━━━◈

🔍 ${config.PREFIX}add  
🔍 ${config.PREFIX}kick  
🔍 ${config.PREFIX}promote  
🔍 ${config.PREFIX}demote  
🔍 ${config.PREFIX}group <open/close>
🔍 ${config.PREFIX}groupcreate  
🔍 ${config.PREFIX}groupinfo  
🔍 ${config.PREFIX}invite  
🔍 ${config.PREFIX}revoke  
🔍 ${config.PREFIX}tagall  
🔍 ${config.PREFIX}hidetag  

> ${BOT_NAME}
`
                  }, { quoted: received });

                }

                // ================= ADVANCED TOOLS =================

                if (selectedId === `${config.PREFIX}adv_menu`) {

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
◈━━━━━━━━━━━━━━◈
┃ 🎨 ADVANCED TOOLS
◈━━━━━━━━━━━━━━◈

🔍 ${config.PREFIX}poll  
🔍 ${config.PREFIX}event  
🔍 ${config.PREFIX}cinfo  

> ${BOT_NAME}
`
                  }, { quoted: received });

                }

                // ================= CHANNEL MANAGER =================

                if (selectedId === `${config.PREFIX}channel_menu`) {

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
◈━━━━━━━━━━━━━━◈
┃ 📢 CHANNEL MANAGER
◈━━━━━━━━━━━━━━◈
 
🔍 ${config.PREFIX}cjoin <jid>  
🔍 ${config.PREFIX}cleave <jid>  
🔍 ${config.PREFIX}cmute <jid>  
🔍 ${config.PREFIX}cunmute <jid>  
🔍 ${config.PREFIX}clist  
🔍 ${config.PREFIX}ccreate <name>  
🔍 ${config.PREFIX}cupdate <jid>  
🔍 ${config.PREFIX}cinfo <jid>
 
> ${BOT_NAME}
`
                  }, { quoted: received });

                }


              } catch (err) {
                console.error("Button handler error:", err);
              }
            };

            socket.ev.on("messages.upsert", menuHandler);

            setTimeout(() => {
              socket.ev.off("messages.upsert", menuHandler);
            }, 60000);

          } catch (err) {
            console.error("panel error:", err);
          }

          break;
        }

        case 'pvideo': {
          const apiBase = 'https://mp3mp4.vercel.app/api/yt1?url=';

          const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text || '';

          if (!q) return socket.sendMessage(from, { text: '*Enter URL or title*' });

          const extractId = (url) => {
            const r = /(?:youtube\.com|youtu\.be).*?(?:v=|\/)([a-zA-Z0-9_-]{11})/;
            const m = url.match(r);
            return m ? m[1] : null;
          };

          try {
            let ytUrl;

            if (extractId(q)) {
              ytUrl = `https://youtube.com/watch?v=${extractId(q)}`;
            } else {
              const search = await yts(q);
              if (!search.videos.length) {
                return socket.sendMessage(from, { text: '*No results found*' });
              }
              ytUrl = search.videos[0].url;
            }

            const res = await axios.get(apiBase + encodeURIComponent(ytUrl));
            const data = res.data.api.data;

            const videos = data.mediaItems.filter(v => v.type === "Video");
            const audios = data.mediaItems.filter(v => v.type === "Audio");

            // 🎯 POLL OPTIONS
            const options = [];

            videos.slice(0, 3).forEach(v => {
              options.push(`🎥 ${v.mediaQuality}`);
            });

            audios.slice(0, 2).forEach(a => {
              options.push(`🎵 ${a.mediaQuality}`);
            });

            // 🧠 MAP
            const map = {};
            let i = 0;

            videos.slice(0, 3).forEach(v => {
              map[options[i]] = { type: 'video', data: v };
              i++;
            });

            audios.slice(0, 2).forEach(a => {
              map[options[i]] = { type: 'audio', data: a };
              i++;
            });

            // 📊 SEND POLL
            const pollMsg = await socket.sendMessage(from, {
              poll: {
                name: `🎬 ${data.title}\n\nSelect Format`,
                values: options,
                selectableCount: 1
              }
            }, { quoted: msg });

            // 🎧 LISTENER
            const handler = async (update) => {
              const m = update.messages?.[0];
              if (!m) return;

              if (m.key.remoteJid !== from) return;

              const vote = m.message?.pollUpdateMessage;
              if (!vote) return;

              // check poll id
              if (vote.pollCreationMessageKey?.id !== pollMsg.key.id) return;

              try {
                const selected = vote.vote?.selectedOptions?.[0];
                if (!selected) return;

                const selectedText = selected;

                const item = map[selectedText];
                if (!item) return;

                await socket.sendMessage(from, {
                  react: { text: '📥', key: m.key }
                });

                if (item.type === 'video') {
                  await socket.sendMessage(from, {
                    video: { url: item.data.mediaPreviewUrl },
                    caption: data.title
                  }, { quoted: m });

                } else {
                  await socket.sendMessage(from, {
                    audio: { url: item.data.mediaPreviewUrl },
                    mimetype: "audio/mpeg",
                    fileName: data.title + ".mp3"
                  }, { quoted: m });
                }

              } catch (e) {
                console.error(e);
                socket.sendMessage(from, { text: "❌ Error processing poll" });
              }

              socket.ev.off("messages.upsert", handler);
            };

            socket.ev.on("messages.upsert", handler);

            setTimeout(() => {
              socket.ev.off("messages.upsert", handler);
            }, 300000);

          } catch (e) {
            console.error(e);
            socket.sendMessage(from, { text: "❌ Failed" });
          }

          break;
        }


        case 'video': {
          const api = "https://mp3mp4.vercel.app/api/yt2?url=";

          await socket.sendMessage(from, { react: { text: '🎥', key: msg.key } });

          const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

          if (!q.trim()) {
            return socket.sendMessage(from, { text: '*Enter YouTube URL or Title.*' });
          }

          try {
            // search video
            const search = await yts(q);
            const v = search.videos[0];
            if (!v) return socket.sendMessage(from, { text: '*No results found.*' });

            const url = v.url;
            const res = await axios.get(api + encodeURIComponent(url));

            if (!res.data.success) {
              return socket.sendMessage(from, { text: "❌ API Error" });
            }

            const data = res.data.data.data;

            const caption = `🎬 *VIDEO DOWNLOADER*

📌 Title: ${data.title}
⏱ Duration: ${data.duration}
👤 Channel: ${data.uploader}

Reply:
1️⃣ Video 360p
2️⃣ Video 480p
3️⃣ Audio (MP3)
`;

            const sent = await socket.sendMessage(from, {
              image: { url: data.thumbnail },
              caption: caption
            }, { quoted: msg });

            const handler = async (update) => {
              const m = update.messages?.[0];
              if (!m) return;

              if (m.key.remoteJid !== from) return;

              const text =
                m.message?.conversation ||
                m.message?.extendedTextMessage?.text;

              if (!text) return;

              if (m.message?.extendedTextMessage?.contextInfo?.stanzaId !== sent.key.id) return;

              await socket.sendMessage(from, {
                react: { text: "📥", key: m.key }
              });

              try {
                if (text === "1") {
                  const link = data.links.find(l => l.resolution === "360p");
                  await socket.sendMessage(from, {
                    video: { url: link.download_url },
                    caption: data.title
                  }, { quoted: m });

                } else if (text === "2") {
                  const link = data.links.find(l => l.resolution === "480p");
                  await socket.sendMessage(from, {
                    video: { url: link.download_url },
                    caption: data.title
                  }, { quoted: m });

                } else if (text === "3") {
                  // audio එක direct නැති නිසා fallback trick
                  await socket.sendMessage(from, {
                    text: "⚠️ Audio not available in this API.\nUse video → convert."
                  }, { quoted: m });

                } else {
                  await socket.sendMessage(from, {
                    text: "❌ Invalid option"
                  }, { quoted: m });
                }

              } catch (err) {
                console.error(err);
                await socket.sendMessage(from, {
                  text: "❌ Download failed"
                }, { quoted: m });
              }

              socket.ev.off("messages.upsert", handler);
            };

            socket.ev.on("messages.upsert", handler);

            setTimeout(() => {
              socket.ev.off("messages.upsert", handler);
            }, 5 * 60 * 1000);

          } catch (e) {
            console.error(e);
            socket.sendMessage(from, {
              text: "❌ Error fetching video"
            });
          }

          break;
        }



        case 'panel2': {
          try {
            await socket.sendMessage(sender, {
              react: { text: "📋", key: msg.key }
            });

            let userCfg = {};
            const cleanNumber = (number || '').replace(/[^0-9]/g, '');

            if (cleanNumber && typeof loadUserConfigFromMongo === 'function') {
              userCfg = await loadUserConfigFromMongo(cleanNumber) || {};
            }

            const MENU_IMG = "https://i.ibb.co/pB4Y9PrD/c30081ff2ffb.jpg";
            const OWNER_NAME = 'MADUSANKA📂';
            const BOT_NAME =
              userCfg.botName || 'MADUSHANKA MD MINI BOT';

            const userTag = `@${sender.split("@")[0]}`;

            const menuText = `
----------------------------------------
       *${BOT_NAME}*
┃ 👤 *Owner:* ${OWNER_NAME}
========================================

👤 *Hey:* ${userTag}

________________________________________
┃ ☘️ *SELECT YOUR MENU*
┃
┃ 📥 *DOWNLOAD MENU*
┃ 🎨 *CREATIVE MENU*
┃ 📦 *TOOLS MENU*
┃
========================================
[ ⚙️ *THE BETA BOT PROJECT* ]
========================================

> _*${BOT_NAME}*_
> 📌 Please select a menu below:
`.trim();

            // BUTTON LIST
            const buttons = [
              {
                buttonId: 'menu_select',
                buttonText: {
                  displayText: 'MAIN MENU'
                },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'CLICK HERE',
                    sections: [
                      {
                        title: 'MENU COLLECTION 📦',
                        rows: [
                          {
                            title: 'Download Menu',
                            description: 'More download options',
                            id: `${config.PREFIX}download`
                          },
                          {
                            title: 'Creative Menu',
                            description: 'Creative tools',
                            id: `${config.PREFIX}creative`
                          },
                          {
                            title: 'Tools Menu',
                            description: 'System tools',
                            id: `${config.PREFIX}tools`
                          }
                        ]
                      }
                    ]
                  })
                }
              }
            ];

            const buttonMessage = {
              image: { url: MENU_IMG },
              caption: menuText,
              buttons: buttons,
              headerType: 4
            };

            await socket.sendMessage(
              sender,
              buttonMessage,
              { quoted: msg }
            );

            // ================= HANDLER =================

            const menuHandler = async (msgUpdate) => {
              try {
                const received = msgUpdate.messages?.[0];
                if (!received) return;

                if (received.key.remoteJid !== sender) return;

                let selectedId;

                const params =
                  received.message?.interactiveResponseMessage
                    ?.nativeFlowResponseMessage?.paramsJson;

                if (params) {
                  const parsed = JSON.parse(params);
                  selectedId = parsed.id;
                }

                if (!selectedId) return;

                await socket.sendMessage(sender, {
                  react: { text: "✅", key: received.key }
                });

                // ================= DOWNLOAD =================

                if (selectedId === `${config.PREFIX}download`) {

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
◈━━━━━━━━━━━━━━◈
┃ 🎧 DOWNLOAD MENU
◈━━━━━━━━━━━━━━◈

🔍  ${config.PREFIX}song  
🔍  ${config.PREFIX}video  
🔍  ${config.PREFIX}fb  
🔍  ${config.PREFIX}tiktok  
🔍  ${config.PREFIX}ig  
🔍  ${config.PREFIX}mediafire  
🔍  ${config.PREFIX}apk

> ${BOT_NAME}
`
                  }, { quoted: received });

                }

                // ================= CREATIVE =================

                if (selectedId === `${config.PREFIX}creative`) {

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
◈━━━━━━━━━━━━━━◈
┃ ðŸƒ CREATIVE MENU
◈━━━━━━━━━━━━━━◈

🔍  ${config.PREFIX}img  
🔍  ${config.PREFIX}aiimg  
🔍  ${config.PREFIX}font  
🔍  ${config.PREFIX}calc  
🔍  ${config.PREFIX}tr  
🔍  ${config.PREFIX}weather  
🔍  ${config.PREFIX}git  

> ${BOT_NAME}
`
                  }, { quoted: received });

                }

                // ================= TOOLS =================

                if (selectedId === `${config.PREFIX}tools`) {

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
◈━━━━━━━━━━━━━━◈
┃ 🔍  TOOLS MENU
◈━━━━━━━━━━━━━━◈

🔍  ${config.PREFIX}menu  
🔍  ${config.PREFIX}setting  
🔍  ${config.PREFIX}system  
🔍  ${config.PREFIX}alive  
🔍  ${config.PREFIX}ping  

> ${BOT_NAME}
`
                  }, { quoted: received });

                }

                // ================= GROUP MANAGER =================

                if (selectedId === `${config.PREFIX}group_menu`) {

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
◈━━━━━━━━━━━━━━◈
┃ ⛩️ GROUP MANAGER
◈━━━━━━━━━━━━━━◈

🔍  ${config.PREFIX}add  
🔍  ${config.PREFIX}kick  
🔍  ${config.PREFIX}promote  
🔍  ${config.PREFIX}demote  
🔍  ${config.PREFIX}group <open/close>
🔍  ${config.PREFIX}groupcreate  
🔍  ${config.PREFIX}groupinfo  
🔍  ${config.PREFIX}invite  
🔍  ${config.PREFIX}revoke  
🔍  ${config.PREFIX}tagall  
🔍  ${config.PREFIX}hidetag  

> ${BOT_NAME}
`
                  }, { quoted: received });

                }

                // ================= ADVANCED TOOLS =================

                if (selectedId === `${config.PREFIX}adv_menu`) {

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
◈━━━━━━━━━━━━━━◈
┃ 🎨 ADVANCED TOOLS
◈━━━━━━━━━━━━━━◈

🔍  ${config.PREFIX}poll  
🔍  ${config.PREFIX}event  
🔍  ${config.PREFIX}cinfo  

> ${BOT_NAME}
`
                  }, { quoted: received });

                }

                // ================= CHANNEL MANAGER =================

                if (selectedId === `${config.PREFIX}channel_menu`) {

                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
◈━━━━━━━━━━━━━━◈
┃ 📢 CHANNEL MANAGER
◈━━━━━━━━━━━━━━◈
 
🔍  ${config.PREFIX}cjoin <jid>  
🔍  ${config.PREFIX}cleave <jid>  
🔍  ${config.PREFIX}cmute <jid>  
🔍  ${config.PREFIX}cunmute <jid>  
🔍  ${config.PREFIX}clist  
🔍  ${config.PREFIX}ccreate <name>  
🔍  ${config.PREFIX}cupdate <jid>  
🔍  ${config.PREFIX}cinfo <jid>
 
> ${BOT_NAME}
`
                  }, { quoted: received });

                }

              } catch (err) {
                console.error("Button handler error:", err);
              }
            };

            socket.ev.on("messages.upsert", menuHandler);

            setTimeout(() => {
              socket.ev.off("messages.upsert", menuHandler);
            }, 60000);

          } catch (err) {
            console.error("panel error:", err);
          }

          break;
        }

        case 'panel': {
          try {
            await socket.sendMessage(sender, { react: { text: "📋", key: msg.key } });

            let userCfg = {};
            const cleanNumber = (number || '').replace(/[^0-9]/g, '');
            if (cleanNumber && typeof loadUserConfigFromMongo === 'function') {
              userCfg = await loadUserConfigFromMongo(cleanNumber) || {};
            }

            const MENU_IMG = "https://files.catbox.moe/x54ibb.jpg";
            const OWNER_NAME = 'damith madushanka';
            const BOT_NAME = userCfg.botName || 'ðŒð€ðƒð”ð’ð€𝐍ðŠð€ ðŒðƒ ðŒðˆ𝐍ðˆ 𝐁ðŽð“';

            const userTag = `@${sender.split("@")[0]}`;

            const menuText = `
◈━━━━━━━━━━━━━━◈
┃ 👤 Owner : ${OWNER_NAME}
◈━━━━━━━━━━━━━━◈

👤 Hey : ${userTag}

◈━━━━━━━━━━━━━━◈
┃⛩️ SELECT YOUR MENU
┃
┃⛩️ á´…ᴏᴡɴÊŸᴏá´€á´… ᴍá´‡ɴá´œ
┃🍃 CREATIVE MENU
┃🔍  á´›ᴏᴏÊŸêœ± ᴍá´‡ɴá´œ
┃
◈━━━━━━━━━━━━━━◈
╭━━━━━━━━━━━━━━━━━╮
┃🔍  THE BETA BOT PROJECT
╰━━━━━━━━━━━━━━━━━╯

> _*${BOT_NAME}*_
> 📌 Please select a menu below:
`.trim();

            // BUTTONS
            const buttons = [
              {
                buttonId: 'action',
                buttonText: {
                  displayText: 'MAIN MENU'
                },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'CLICK HERE',
                    sections: [
                      {
                        title: `Menu Collection 🎨`,
                        highlight_label: 'Welcome Menu ☘️',
                        rows: [
                          {
                            title: '📥 Download Menu',
                            description: 'See more download options 🔍 ',
                            id: `download`,
                          },
                          {
                            title: '🎨 Creative Menu',
                            description: 'Bot has a few creative tools 🤖',
                            id: `creative`,
                          },
                          {
                            title: '📦 Tools Menu',
                            description: 'Open your tool box 🛠️',
                            id: `tools`,
                          },
                        ],
                      },
                    ],
                  }),
                },
              },
            ]

            const buttonMessage = {
              image: { url: MENU_IMG },
              caption: menuText,
              buttons: buttons,
              headerType: 4
            };

            const sentMsg = await socket.sendMessage(
              sender,
              buttonMessage,
              { quoted: msg }
            );

            // BUTTON RESPONSE HANDLER
            const menuHandler = async (msgUpdate) => {
              try {
                const received = msgUpdate.messages?.[0];
                if (!received) return;

                const fromId = received.key.remoteJid;
                if (fromId !== sender) return;

                const buttonId =
                  received.message?.buttonsResponseMessage?.selectedButtonId;

                if (!buttonId) return;

                await socket.sendMessage(sender, {
                  react: { text: "✅", key: received.key }
                });

                if (buttonId === 'download') {
                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
----------------------------------------
┃ 👋 Welcome to ${BOT_NAME}
========================================

________________________________________
┃ 🎧 DOWNLOAD MENU
========================================
THIS IS THE BETA PROJECT
________________________________________
┃⚠️ List of download
┃
┃🔍  ${config.PREFIX}song
┃🎥 ${config.PREFIX}video
┃📘 ${config.PREFIX}fb
┃🎵 ${config.PREFIX}tiktok
┃📸 ${config.PREFIX}ig
┃📁 ${config.PREFIX}mediafire
┃📦 ${config.PREFIX}apk
========================================
> _*MADUSHANKA MD MINI BOT*_`
                  }, { quoted: received });
                }

                if (buttonId === 'creative') {
                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
----------------------------------------
┃ 👋 Welcome to ${BOT_NAME}
========================================

________________________________________
┃ 🎨 CREATIVE MENU
========================================
THIS IS THE BETA PROJECT
________________________________________
┃⚠️ List of creative
┃
┃🖼️ ${config.PREFIX}img
┃🤖 ${config.PREFIX}aiimg
┃🔍  ${config.PREFIX}font
┃🔍  ${config.PREFIX}calc
┃🌐 ${config.PREFIX}tr
┃☁️ ${config.PREFIX}weather
┃💻 ${config.PREFIX}git
========================================
> _*MADUSHANKA MD MINI BOT*_`
                  }, { quoted: received });
                }

                if (buttonId === 'tools') {
                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `
----------------------------------------
┃ 👋 Welcome to ${BOT_NAME}
========================================

________________________________________
┃ 🛠️ TOOLS MENU
========================================
THIS IS THE BETA PROJECT
________________________________________
┃⚠️ List of tools
┃
┃⚙️ ${config.PREFIX}menu
┃⚙️ ${config.PREFIX}setting
┃⚙️ ${config.PREFIX}system
┃⚙️ ${config.PREFIX}tagall
┃⚙️ ${config.PREFIX}hidetag
┃⚙️ ${config.PREFIX}alive
┃⚙️ ${config.PREFIX}ping
========================================
> _*MADUSHANKA MD MINI BOT*_`
                  }, { quoted: received });
                }

              } catch (err) {
                console.error("Button handler error:", err);
              }
            };

            socket.ev.on('messages.upsert', menuHandler);

            setTimeout(() => {
              socket.ev.off('messages.upsert', menuHandler);
            }, 60000);

          } catch (err) {
            console.error('menu error:', err);
          }
          break;
        }


        case 'list': {
          try {
            await socket.sendMessage(sender, { react: { text: "📑", key: msg.key } });

            let userCfg = {};
            const cleanNumber = (number || '').replace(/[^0-9]/g, '');
            if (cleanNumber && typeof loadUserConfigFromMongo === 'function') {
              userCfg = await loadUserConfigFromMongo(cleanNumber) || {};
            }

            const MENU_IMG = "https://files.catbox.moe/x54ibb.jpg";
            const OWNER_NAME = 'damith madushanka';
            const BOT_NAME = userCfg.botName || 'MADUSHANKA MD MINI BOT';

            const userTag = `@${sender.split("@")[0]}`;

            const menuText = `
----------------------------------------
       *${BOT_NAME}*
┃ 👤 *Owner:* ${OWNER_NAME}
========================================

👤 *Hey:* ${userTag}

________________________________________
┃ ☘️ *SELECT YOUR MENU*
┃
┃ 📥 *DOWNLOAD MENU*
┃ 🎨 *CREATIVE MENU*
┃ 📦 *TOOLS MENU*
┃
========================================
[ ⚙️ *THE BETA BOT PROJECT* ]
========================================

> _*MADUSHANKA MD MINI BOT*_
> 📌 Please select a menu below:
`.trim();

            // BUTTONS
            const buttons = [
              {
                buttonId: 'menu_dl',
                buttonText: { displayText: 'Download Menu 📥' },
                type: 1
              },
              {
                buttonId: 'menu_cr',
                buttonText: { displayText: 'Creative Menu 🎨' },
                type: 1
              },
              {
                buttonId: 'menu_tools',
                buttonText: { displayText: 'Tools Menu 📦' },
                type: 1
              }
            ];

            const buttonMessage = {
              image: { url: MENU_IMG },
              caption: menuText,
              buttons: buttons,
              headerType: 4
            };

            const sentMsg = await socket.sendMessage(
              sender,
              buttonMessage,
              { quoted: msg }
            );

            // BUTTON RESPONSE HANDLER
            const menuHandler = async (msgUpdate) => {
              try {
                const received = msgUpdate.messages?.[0];
                if (!received) return;

                const fromId = received.key.remoteJid;
                if (fromId !== sender) return;

                const buttonId =
                  received.message?.buttonsResponseMessage?.selectedButtonId;

                if (!buttonId) return;

                await socket.sendMessage(sender, {
                  react: { text: "✅", key: received.key }
                });

                if (buttonId === 'menu_dl') {
                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `*📥 DOWNLOADER LIST*

${config.PREFIX}song
${config.PREFIX}tiktok
${config.PREFIX}video
${config.PREFIX}fb
${config.PREFIX}instagram
${config.PREFIX}apk
${config.PREFIX}mediafire`
                  }, { quoted: received });
                }

                if (buttonId === 'menu_cr') {
                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `*🎨 CREATIVE LIST*

${config.PREFIX}ai
${config.PREFIX}aiimg
${config.PREFIX}font
${config.PREFIX}calc
${config.PREFIX}translate`
                  }, { quoted: received });
                }

                if (buttonId === 'menu_tools') {
                  await socket.sendMessage(sender, {
                    image: { url: MENU_IMG },
                    caption: `*🛠️ TOOLS LIST*

${config.PREFIX}jid
${config.PREFIX}system
${config.PREFIX}tagall
${config.PREFIX}hidetag
${config.PREFIX}weather
${config.PREFIX}ping`
                  }, { quoted: received });
                }

              } catch (err) {
                console.error("Button handler error:", err);
              }
            };

            socket.ev.on('messages.upsert', menuHandler);

            setTimeout(() => {
              socket.ev.off('messages.upsert', menuHandler);
            }, 60000);

          } catch (err) {
            console.error('menu error:', err);
          }
          break;
        }
        case 'menu1': {
          try {
            // React with emoji
            await socket.sendMessage(sender, { react: { text: "☢️", key: msg.key } });

            // User configuration load 
            let userCfg = {};
            const cleanNumber = (number || '').replace(/[^0-9]/g, '');
            try {
              if (cleanNumber && typeof loadUserConfigFromMongo === 'function') {
                userCfg = await loadUserConfigFromMongo(cleanNumber) || {};
              }
            } catch (e) { console.warn('menu: config load failed', e); }

            // Constants & Stats
            const VIDEO_INTRO = 'https://files.catbox.moe/ihyzsf.mp4';
            const MENU_IMG = "https://files.catbox.moe/x54ibb.jpg";
            const OWNER_NAME = 'damith madushanka';
            const BOT_NAME = userCfg.botName || 'MADUSHANKA MD MINI BOT';

            const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
            const uptime = process.uptime();
            const days = Math.floor(uptime / (24 * 3600));
            const hours = Math.floor((uptime % (24 * 3600)) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const runtime = `${days}D ${hours}H ${minutes}M`;

            // Time & Greeting
            const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
            const hour = slNow.getHours();
            const timeStr = slNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
            const dateStr = slNow.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });

            let greetingText = (hour < 5) ? "🌌 Early Morning" : (hour < 12) ? "🌅 Good Morning" : (hour < 18) ? "🌞 Good Afternoon" : (hour < 22) ? "🌙 Good Evening" : "🦉 Sweet Dreams";

            const quotes = ["Great things never came from comfort zones.", "Dream it. Wish it. Do it.", "Success is not final, failure is not fatal."];
            const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
            const userTag = `@${sender.split("@")[0]}`;

            // 1. Send Video Note First
            await socket.sendMessage(sender, {
              video: { url: VIDEO_INTRO },
              ptv: true,
              gifPlayback: true,
              caption: "✨ System Booting..."
            });

            const menuText = `
----------------------------------------
[ ${greetingText} ]
========================================
┃ 👤 Hey: ${userTag}
________________________________________
[ ⚡ ${BOT_NAME} ⚡ ]
┃ 👤 Owner: ${OWNER_NAME}
┃ 🚀 Version: 2.0.0 (Pro)
┃ ⏳ Uptime: ${runtime}
┃ 💾 RAM: ${ramUsage}MB
________________________________________
[ 📅 Daily Info ]
┃ ⌚ Time: ${timeStr}
┃ 📆 Date: ${dateStr}
========================================
❝ ${randomQuote} ❞
========================================
[ 🔍  NUMBER SYSTEM ]
┃ 1️⃣ Download Menu
┃ 2️⃣ Creative Menu
┃ 3️⃣ Tools Menu
========================================
> ✨ Reply with a number
----------------------------------------`.trim();

            // 2. Send Main Menu Image
            const sentMsg = await socket.sendMessage(sender, {
              image: { url: MENU_IMG },
              caption: menuText,
              mentions: [sender]
            }, { quoted: msg });

            // 3. Reply Handler Logic
            const menuHandler = async (msgUpdate) => {
              try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received || !received.message) return;

                const fromId = received.key.remoteJid;
                if (fromId !== sender) return;

                const text = received.message?.conversation || received.message?.extendedTextMessage?.text;
                if (!text) return;

                const quotedId = received.message?.extendedTextMessage?.contextInfo?.stanzaId;
                if (quotedId !== sentMsg.key.id) return;

                const choice = text.trim();

                if (['1', '2', '3'].includes(choice)) {
                  await socket.sendMessage(sender, { react: { text: '✅', key: received.key } });

                  if (choice === '1') {
                    await socket.sendMessage(sender, {
                      image: { url: MENU_IMG },
                      caption: `
----------------------------------------
┃ 🎧 DOWNLOAD MENU
========================================

________________________________________
┃⚠️ List of download
┃
┃🔍  ${config.PREFIX}song
┃🎥 ${config.PREFIX}video
┃📘 ${config.PREFIX}fb
┃🎵 ${config.PREFIX}tiktok
┃📸 ${config.PREFIX}ig
┃📁 ${config.PREFIX}mediafire
┃📦 ${config.PREFIX}apk
========================================
> _*MADUSHANKA MD MINI BOT*_`
                    }, { quoted: received });
                  }
                  else if (choice === '2') {
                    await socket.sendMessage(sender, {
                      image: { url: MENU_IMG },
                      caption: `
----------------------------------------
┃ 🎨 CREATIVE MENU
========================================

________________________________________
┃⚠️ List of creative
┃
┃🖼️ ${config.PREFIX}img
┃🤖 ${config.PREFIX}aiimg
┃🔍  ${config.PREFIX}font
┃🔍  ${config.PREFIX}calc
┃🌐 ${config.PREFIX}tr
┃☁️ ${config.PREFIX}weather
┃💻 ${config.PREFIX}git
========================================
> _*MADUSHANKA MD MINI BOT*_`
                    }, { quoted: received });
                  }
                  else if (choice === '3') {
                    await socket.sendMessage(sender, {
                      image: { url: MENU_IMG },
                      caption: `
----------------------------------------
┃ 🛠️ TOOLS MENU
========================================

________________________________________
┃⚠️ List of tools
┃
┃⚙️ ${config.PREFIX}menu
┃⚙️ ${config.PREFIX}setting
┃⚙️ ${config.PREFIX}system
┃⚙️ ${config.PREFIX}tagall
┃⚙️ ${config.PREFIX}hidetag
┃⚙️ ${config.PREFIX}alive
┃⚙️ ${config.PREFIX}ping
========================================
> _*MADUSHANKA MD MINI BOT*_`
                    }, { quoted: received });
                  }
                }
              } catch (err) {
                console.error("Menu handler error:", err);
              }
            };

            socket.ev.on('messages.upsert', menuHandler);

            // Remove listener after 60 seconds
            setTimeout(() => {
              socket.ev.off('messages.upsert', menuHandler);
            }, 60000);

          } catch (err) {
            console.error('menu error:', err);
          }
          break;
        }




        case 'autotyping': {
          await socket.sendMessage(sender, { react: { text: '⌨️ ', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto typing.' }, { quoted: shonux });
            }

            let q = args[0];
            const settings = { on: "true", off: "false" };

            if (settings[q]) {
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              userConfig.AUTO_TYPING = settings[q];

              // If turning on auto typing, turn off auto recording to avoid conflict
              if (q === 'on') {
                userConfig.AUTO_RECORDING = "false";
              }

              await setUserConfigInMongo(sanitized, userConfig);

              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: `✅ *Auto Typing ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
            } else {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING3" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: "❌ *Options:* on / off" }, { quoted: shonux });
            }
          } catch (e) {
            console.error('Autotyping error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*❌ Error updating auto typing!*" }, { quoted: shonux });
          }
          break;
        }

        case 'rstatus': {
          await socket.sendMessage(sender, { react: { text: '👁️', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change status seen setting.' }, { quoted: shonux });
            }

            let q = args[0];
            const settings = { on: "true", off: "false" };

            if (settings[q]) {
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              userConfig.AUTO_VIEW_STATUS = settings[q];
              await setUserConfigInMongo(sanitized, userConfig);

              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: `✅ *Your Auto Status Seen ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
            } else {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS3" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
            }
          } catch (e) {
            console.error('Rstatus command error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RSTATUS4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*❌ Error updating your status seen setting!*" }, { quoted: shonux });
          }
          break;
        }

        case 'creject': {
          await socket.sendMessage(sender, { react: { text: '📞', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change call reject setting.' }, { quoted: shonux });
            }

            let q = args[0];
            const settings = { on: "on", off: "off" };

            if (settings[q]) {
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              userConfig.ANTI_CALL = settings[q];
              await setUserConfigInMongo(sanitized, userConfig);

              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: `✅ *Your Auto Call Reject ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
            } else {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT3" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
            }
          } catch (e) {
            console.error('Creject command error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*❌ Error updating your call reject setting!*" }, { quoted: shonux });
          }
          break;
        }

        case 'arm': {
          await socket.sendMessage(sender, { react: { text: '❤️', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change status react setting.' }, { quoted: shonux });
            }

            let q = args[0];
            const settings = { on: "true", off: "false" };

            if (settings[q]) {
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              userConfig.AUTO_LIKE_STATUS = settings[q];
              await setUserConfigInMongo(sanitized, userConfig);

              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: `✅ *Your Auto Status React ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
            } else {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM3" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
            }
          } catch (e) {
            console.error('Arm command error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ARM4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*❌ Error updating your status react setting!*" }, { quoted: shonux });
          }
          break;
        }

        case 'mread': {
          await socket.sendMessage(sender, { react: { text: '📋–', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: 'âŒ Permission denied. Only the session owner or bot owner can change message read setting.' }, { quoted: shonux });
            }

            let q = args[0];
            const settings = { all: "all", cmd: "cmd", off: "off" };

            if (settings[q]) {
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              userConfig.AUTO_READ_MESSAGE = settings[q];
              await setUserConfigInMongo(sanitized, userConfig);

              let statusText = "";
              switch (q) {
                case "all":
                  statusText = "READ ALL MESSAGES";
                  break;
                case "cmd":
                  statusText = "READ ONLY COMMAND MESSAGES";
                  break;
                case "off":
                  statusText = "DONT READ ANY MESSAGES";
                  break;
              }

              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: `✅ *Your Auto Message Read: ${statusText}*` }, { quoted: shonux });
            } else {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD3" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: "âŒ *Invalid option!*\n\nAvailable options:\n- all\n- cmd\n- off" }, { quoted: shonux });
            }
          } catch (e) {
            console.error('Mread command error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*âŒ Error updating your message read setting!*" }, { quoted: shonux });
          }
          break;
        }

        case 'autorecording': {
          await socket.sendMessage(sender, { react: { text: '🎡¥', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: 'âŒ Permission denied. Only the session owner or bot owner can change auto recording.' }, { quoted: shonux });
            }

            let q = args[0];

            if (q === 'on' || q === 'off') {
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              userConfig.AUTO_RECORDING = (q === 'on') ? "true" : "false";

              // If turning on auto recording, turn off auto typing to avoid conflict
              if (q === 'on') {
                userConfig.AUTO_TYPING = "false";
              }

              await setUserConfigInMongo(sanitized, userConfig);

              // Immediately stop any current recording if turning off
              if (q === 'off') {
                await socket.sendPresenceUpdate('available', sender);
              }

              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: `✅ *Auto Recording ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
            } else {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING3" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: "âŒ *Invalid! Use:* .autorecording on/off" }, { quoted: shonux });
            }
          } catch (e) {
            console.error('Autorecording error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*âŒ Error updating auto recording!*" }, { quoted: shonux });
          }
          break;
        }

        case 'prefix': {
          await socket.sendMessage(sender, { react: { text: '💤', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: 'âŒ Permission denied. Only the session owner or bot owner can change prefix.' }, { quoted: shonux });
            }

            let newPrefix = args[0];
            if (!newPrefix || newPrefix.length > 2) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: "âŒ *Invalid prefix!*\nPrefix must be 1-2 characters long." }, { quoted: shonux });
            }

            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            userConfig.PREFIX = newPrefix;
            await setUserConfigInMongo(sanitized, userConfig);

            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX3" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: `✅ *Your Prefix updated to: ${newPrefix}*` }, { quoted: shonux });
          } catch (e) {
            console.error('Prefix command error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*âŒ Error updating your prefix!*" }, { quoted: shonux });
          }
          break;
        }

        case 'settings': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: 'âŒ Permission denied. Only the session owner or bot owner can view settings.' }, { quoted: shonux });
            }

            const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
            const botName = currentConfig.botName || BOT_NAME_FANCY;

            const settingsText = `
╭━━━━━━━━━━━━━━━━━━━━━━━━╮
┃♻️  Work Type : ${currentConfig.WORK_TYPE || 'public'}
┃💤 Presence : ${currentConfig.PRESENCE || 'available'}
┃👁️‍🗨️ Auto Status View: ${currentConfig.AUTO_VIEW_STATUS || 'true'}
┃❤️‍🔥 Auto Status Reaction : ${currentConfig.AUTO_LIKE_STATUS || 'true'}
┃📵 Auto Reject Calls : ${currentConfig.ANTI_CALL || 'off'}
┃💬 Auto Msg Read : ${currentConfig.AUTO_READ_MESSAGE || 'off'}
┃🎤 Auto Recording : ${currentConfig.AUTO_RECORDING || 'false'}
┃⌨️  Auto Typing : ${currentConfig.AUTO_TYPING || 'false'}
┃🔖 Prefix : ${currentConfig.PREFIX || '.'}
┃📦 Reaction Emojis: ${(currentConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).join(' ')}
╰━━━━━━━━━━━━━━━━━━━━━━━━╯
    `;

            await socket.sendMessage(sender, {
              image: { url: currentConfig.logo || config.RCD_IMAGE_PATH },
              caption: settingsText
            }, { quoted: msg });

          } catch (e) {
            console.error('Settings command error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS2" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: shonux });
          }
          break;
        }

        case 'deleteme': {
          // 'number' is the session number passed to setupCommandHandlers (sanitized in caller)
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          // determine who sent the command
          const senderNum = (nowsender || '').split('@')[0];
          const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

          // Permission: only the session owner or the bot OWNER can delete this session
          if (senderNum !== sanitized && senderNum !== ownerNum) {
            await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or the bot owner can delete this session.' }, { quoted: msg });
            break;
          }

          try {
            // 1) Remove from Mongo
            await removeSessionFromMongo(sanitized);
            await removeNumberFromMongo(sanitized);

            // 2) Remove temp session dir
            const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
            try {
              if (fs.existsSync(sessionPath)) {
                fs.removeSync(sessionPath);
                console.log(`Removed session folder: ${sessionPath}`);
              }
            } catch (e) {
              console.warn('Failed removing session folder:', e);
            }

            // 3) Try to logout & close socket
            try {
              if (typeof socket.logout === 'function') {
                await socket.logout().catch(err => console.warn('logout error (ignored):', err?.message || err));
              }
            } catch (e) { console.warn('socket.logout failed:', e?.message || e); }
            try { socket.ws?.close(); } catch (e) { console.warn('ws close failed:', e?.message || e); }

            // 4) Remove from runtime maps
            activeSockets.delete(sanitized);
            socketCreationTime.delete(sanitized);

            // 5) notify user
            await socket.sendMessage(sender, {
              image: { url: config.RCD_IMAGE_PATH },
              caption: formatMessage('🗑️ SESSION DELETED', '♻️  Your session has been successfully deleted from MongoDB and local storage.', BOT_NAME_FANCY)
            }, { quoted: msg });

            console.log(`Session ${sanitized} deleted by ${senderNum}`);
          } catch (err) {
            console.error('deleteme command error:', err);
            await socket.sendMessage(sender, { text: `❌ Failed to delete session: ${err.message || err}` }, { quoted: msg });
          }
          break;
        }

        case 'emojis': {
          await socket.sendMessage(sender, { react: { text: '♻️ ', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');

            // Permission check - only session owner or bot owner can change emojis
            if (senderNum !== sanitized && senderNum !== ownerNum) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change status reaction emojis.' }, { quoted: shonux });
            }

            let newEmojis = args;

            if (!newEmojis || newEmojis.length === 0) {
              // Show current emojis if no args provided
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              const currentEmojis = userConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;

              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };

              return await socket.sendMessage(sender, {
                text: `⌨️ *Current Status Reaction Emojis:*\n\n${currentEmojis.join(' ')}\n\nUsage: \`.emojis ðŸ˜€ ðŸ˜„ ðŸ˜Š 🎡‰ â ¤ï¸ \``
              }, { quoted: shonux });
            }

            // Validate emojis (basic check)
            const invalidEmojis = newEmojis.filter(emoji => !/\p{Emoji}/u.test(emoji));
            if (invalidEmojis.length > 0) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS3" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, {
                text: `❌ *Invalid emojis detected:* ${invalidEmojis.join(' ')}\n\nPlease use valid emoji characters only.`
              }, { quoted: shonux });
            }

            // Get user-specific config from MongoDB
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};

            // Update ONLY this user's emojis
            userConfig.AUTO_LIKE_EMOJI = newEmojis;

            // Save to MongoDB
            await setUserConfigInMongo(sanitized, userConfig);

            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            await socket.sendMessage(sender, {
              text: `✅ *Your Status Reaction Emojis Updated!*\n\nNew emojis: ${newEmojis.join(' ')}\n\nThese emojis will be used for your automatic status reactions.`
            }, { quoted: shonux });

          } catch (e) {
            console.error('Emojis command error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_EMOJIS5" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*❌ Error updating your status reaction emojis!*" }, { quoted: shonux });
          }
          break;
        }
case 'ts': {

  const q = msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || '';

  let query = q.replace(/^[.\/!]ts\s*/i, '').trim();

  if (!query) {
    return await socket.sendMessage(sender, {
      text: '🔍 Please give me some keywords!'
    }, { quoted: msg });
  }

  const sanitized = (number || '').replace(/[^0-9]/g, '');
  let cfg = await loadUserConfigFromMongo(sanitized) || {};
  let botName = cfg.botName || BOT_NAME_FANCY;

  const shonux = {
    key: {
      remoteJid: "status@broadcast",
      participant: "0@s.whatsapp.net",
      fromMe: false,
      id: "META_AI_FAKE_ID_TS"
    },
    message: {
      contactMessage: {
        displayName: botName,
        vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
      }
    }
  };

  try {
    await socket.sendMessage(sender, {
      text: `🔍 Searching TikTok for: *${query}*...`
    }, { quoted: shonux });

    const searchParams = new URLSearchParams({
      keywords: query,
      count: '10',
      cursor: '0',
      HD: '1'
    });

    const response = await axios.post(
      "https://tikwm.com/api/feed/search",
      searchParams,
      {
        headers: {
          'Content-Type': "application/x-www-form-urlencoded; charset=UTF-8",
          'Cookie': "current_language=en",
          'User-Agent': "Mozilla/5.0"
        }
      }
    );

    const videos = response.data?.data?.videos;

    if (!videos || videos.length === 0) {
      return await socket.sendMessage(sender, {
        text: '⚠️ No videos found.'
      }, { quoted: shonux });
    }

    const limit = 3;
    const results = videos.slice(0, limit);

    for (let i = 0; i < results.length; i++) {
      const v = results[i];
      const videoUrl = v.play || v.download || null;
      if (!videoUrl) continue;

      await socket.sendMessage(sender, {
        text: `⏳ Downloading: ${v.title || 'No Title'}`
      }, { quoted: shonux });

      await socket.sendMessage(sender, {
        video: { url: videoUrl },
        caption: `🎵 *${botName} TikTok Downloader*

📌 Title: ${v.title || 'No Title'}
👤 Author: ${v.author?.nickname || 'Unknown'}`
      }, { quoted: shonux });
    }

  } catch (err) {
    console.error('TikTok Search Error:', err);
    await socket.sendMessage(sender, {
      text: `❌ Error: ${err.message}`
    }, { quoted: shonux });
  }

  break;
}
case 'weather':
  try {

    const messages = {
      noCity: "❌ Please provide a city name!\n📌 Example: .weather Colombo",

      weather: (data) => `
🌤️ *WEATHER REPORT*

📍 ${data.name}, ${data.sys.country}

🌡️ Temperature: ${data.main.temp}°C
🤒 Feels Like: ${data.main.feels_like}°C
🔻 Min Temp: ${data.main.temp_min}°C
🔺 Max Temp: ${data.main.temp_max}°C
💧 Humidity: ${data.main.humidity}%
🌥️ Condition: ${data.weather[0].main}
📝 Description: ${data.weather[0].description}
💨 Wind Speed: ${data.wind.speed} m/s
📊 Pressure: ${data.main.pressure} hPa

> ${BOT_NAME_FANCY}
`,

      error: "⚠️ Error occurred! Try again later.",
      cityNotFound: "❌ City not found."
    };

    if (!args || args.length === 0) {
      await socket.sendMessage(sender, { text: messages.noCity });
      break;
    }

    const apiKey = '2d61a72574c11c4f36173b627f8cb177';
    const city = args.join(" ");
    const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

    const response = await axios.get(url);
    const data = response.data;

    const weatherIcon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;

    await socket.sendMessage(sender, {
      image: { url: weatherIcon },
      caption: messages.weather(data)
    });

  } catch (e) {
    console.log(e);
    if (e.response && e.response.status === 404) {
      await socket.sendMessage(sender, { text: "❌ City not found." });
    } else {
      await socket.sendMessage(sender, { text: "⚠️ Error occurred!" });
    }
  }
  break;
case 'weather':
  try {

    const messages = {
      noCity: "❌ Please provide a city name!\n📌 Example: .weather Colombo",

      weather: (data) => `
🌤️ *WEATHER REPORT*

📍 ${data.name}, ${data.sys.country}

🌡️ Temperature: ${data.main.temp}°C
🤒 Feels Like: ${data.main.feels_like}°C
🔻 Min Temp: ${data.main.temp_min}°C
🔺 Max Temp: ${data.main.temp_max}°C
💧 Humidity: ${data.main.humidity}%
🌥️ Condition: ${data.weather[0].main}
📝 Description: ${data.weather[0].description}
💨 Wind Speed: ${data.wind.speed} m/s
📊 Pressure: ${data.main.pressure} hPa

> ${BOT_NAME_FANCY}
`,

      error: "⚠️ Error occurred! Try again later.",
      cityNotFound: "❌ City not found."
    };

    if (!args || args.length === 0) {
      await socket.sendMessage(sender, { text: messages.noCity });
      break;
    }

    const apiKey = '2d61a72574c11c4f36173b627f8cb177';
    const city = args.join(" ");
    const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

    const response = await axios.get(url);
    const data = response.data;

    const weatherIcon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;

    await socket.sendMessage(sender, {
      image: { url: weatherIcon },
      caption: messages.weather(data)
    });

  } catch (e) {
    console.log(e);
    if (e.response && e.response.status === 404) {
      await socket.sendMessage(sender, { text: "❌ City not found." });
    } else {
      await socket.sendMessage(sender, { text: "⚠️ Error occurred!" });
    }
  }
  break;
  // ==================== Online Members in Group ====================
  case 'online': {
    try {
      if (!(from || '').endsWith('@g.us')) {
        await socket.sendMessage(sender, { text: '❌ This command works only in group chats.' }, { quoted: msg });
        break;
      }

      const groupMeta = await socket.groupMetadata(from);
      const participants = (groupMeta.participants || []).map(p => p.id);

      const callerJid = (nowsender || '').replace(/:.*$/, '');
      const callerId = callerJid.includes('@') ? callerJid : `${callerJid}@s.whatsapp.net`;
      const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
      const isOwnerCaller = callerJid.startsWith(ownerNumberClean);
      const groupAdmins = (groupMeta.participants || [])
        .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
        .map(p => p.id);
      const isGroupAdminCaller = groupAdmins.includes(callerId);

      if (!isOwnerCaller && !isGroupAdminCaller) {
        await socket.sendMessage(sender, { text: '❌ Only group admins or bot owner can use this command.' }, { quoted: msg });
        break;
      }

      await socket.sendMessage(sender, { text: '🔄 Scanning for online members... please wait ~15 seconds' }, { quoted: msg });

      const onlineSet = new Set();
      const presenceListener = (update) => {
        if (update?.presences) {
          for (const id of Object.keys(update.presences)) {
            const pres = update.presences[id];
            if (pres?.lastKnownPresence && pres.lastKnownPresence !== 'unavailable') onlineSet.add(id);
            if (pres?.available === true) onlineSet.add(id);
          }
        }
      };

      for (const p of participants) {
        try { if (socket.presenceSubscribe) await socket.presenceSubscribe(p); } catch(e){ }
      }
      socket.ev.on('presence.update', presenceListener);

      await new Promise(resolve => setTimeout(resolve, 15000)); // wait 15s
      socket.ev.off('presence.update', presenceListener);

      if (onlineSet.size === 0) {
        await socket.sendMessage(sender, { text: '⚠️ No online members detected.' }, { quoted: msg });
        break;
      }

      const onlineArray = Array.from(onlineSet).filter(j => participants.includes(j));
      const mentionList = onlineArray.map(j => j);

      const sanitized = (number || '').replace(/[^0-9]/g, '');
      const cfg = await loadUserConfigFromMongo(sanitized) || {};
      const botName = cfg.botName || BOT_NAME_FANCY;

      const metaQuote = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ONLINE" },
        message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };

      let txt = `🟢 *Online Members* — ${onlineArray.length}/${participants.length}\n\n`;
      onlineArray.forEach((jid, i) => { txt += `${i+1}. @${jid.split('@')[0]}\n`; });

      await socket.sendMessage(sender, { text: txt.trim(), mentions: mentionList }, { quoted: metaQuote });

    } catch (err) {
      console.error('Online command error:', err);
      await socket.sendMessage(sender, { text: '❌ Error while checking online members.' }, { quoted: msg });
    }
    break;
  }

// ==================== Facebook Video Download ====================
case 'fb':
case 'fbdl':
case 'facebook':
case 'fbd': {
  try {

    let text = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ''
    ).trim();

    let url = text.split(" ")[1]; // .fb <url>

    if (!url) {
      return await socket.sendMessage(sender, {
        text: '🚫 Please send a Facebook video link.\n\nExample: .fb https://facebook.com/...'
      }, { quoted: msg });
    }

    // 🔍 Load bot name
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || BOT_NAME_FANCY;

    // 🔍 Fake contact (Meta style quote)
    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID_FB"
      },
      message: {
        contactMessage: {
          displayName: botName,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
        }
      }
    };

    // 🔍 API Call
    let api = `https://tharuzz-ofc-api-v2.vercel.app/api/download/fbdl?url=${encodeURIComponent(url)}`;
    let { data } = await axios.get(api);

    if (!data.success || !data.result) {
      return await socket.sendMessage(sender, {
        text: '❌ Failed to fetch Facebook video.'
      }, { quoted: shonux });
    }

    let title = data.result.title || 'Facebook Video';
    let thumb = data.result.thumbnail;
    let hdLink = data.result.dlLink?.hdLink || data.result.dlLink?.sdLink;

    if (!hdLink) {
      return await socket.sendMessage(sender, {
        text: '⚠️ No video link available.'
      }, { quoted: shonux });
    }

    // 🔍 Send thumbnail first
    await socket.sendMessage(sender, {
      image: { url: thumb },
      caption: `🎬 *${title}*

📥 Downloading video...
> ${botName}`
    }, { quoted: shonux });

    // 🔍 Send video
    await socket.sendMessage(sender, {
      video: { url: hdLink },
      caption: `🎬 *${title}*

> ${botName}`
    }, { quoted: shonux });

  } catch (e) {
    console.log('FB Download Error:', e);
    await socket.sendMessage(sender, {
      text: '⚠️ Error downloading Facebook video.'
    }, { quoted: msg });
  }

  break;
}

  

        case 'unfollow': {
          const jid = args[0] ? args[0].trim() : null;
          if (!jid) {
            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch (e) { userCfg = {}; }
            const title = userCfg.botName || BOT_NAME_FANCY;

            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW" },
              message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            return await socket.sendMessage(sender, { text: 'â— Provide channel JID to unfollow. Example:\n.unfollow 120363396379901844@newsletter' }, { quoted: shonux });
          }

          const admins = await loadAdminsFromMongo();
          const normalizedAdmins = admins.map(a => (a || '').toString());
          const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
          const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
          if (!(isOwner || isAdmin)) {
            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch (e) { userCfg = {}; }
            const title = userCfg.botName || BOT_NAME_FANCY;
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW2" },
              message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            return await socket.sendMessage(sender, { text: 'âŒ Permission denied. Only owner or admins can remove channels.' }, { quoted: shonux });
          }

          if (!jid.endsWith('@newsletter')) {
            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch (e) { userCfg = {}; }
            const title = userCfg.botName || BOT_NAME_FANCY;
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW3" },
              message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            return await socket.sendMessage(sender, { text: 'â— Invalid JID. Must end with @newsletter' }, { quoted: shonux });
          }

          try {
            if (typeof socket.newsletterUnfollow === 'function') {
              await socket.newsletterUnfollow(jid);
            }
            await removeNewsletterFromMongo(jid);

            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch (e) { userCfg = {}; }
            const title = userCfg.botName || BOT_NAME_FANCY;
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW4" },
              message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            await socket.sendMessage(sender, { text: `✅ Unfollowed and removed from DB: ${jid}` }, { quoted: shonux });
          } catch (e) {
            console.error('unfollow error', e);
            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch (e) { userCfg = {}; }
            const title = userCfg.botName || BOT_NAME_FANCY;
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW5" },
              message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: `âŒ Failed to unfollow: ${e.message || e}` }, { quoted: shonux });
          }
          break;
        }


        case 'tt':
        case 'tiktokdl': {


          await socket.sendMessage(sender, { react: { text: '🎬', key: msg.key } });

          const q = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

          // Extract the TikTok URL
          const url = q.replace(/^[.\/!]?(tt|tiktokdl)\s*/i, '').trim();

          if (!url) {
            return await socket.sendMessage(sender, {
              text: '*📌 Usage:* .tt <tiktok_url>\n*Example:* .tt https://vt.tiktok.com/ZS57nHKP8/'
            }, { quoted: msg });
          }

          // Check if it's a TikTok URL
          if (!url.includes('tiktok.com') && !url.includes('vt.tiktok')) {
            return await socket.sendMessage(sender, {
              text: '❌ *Invalid TikTok URL.*\nPlease provide a valid TikTok video link!'
            }, { quoted: msg });
          }

          try {
            // Send processing message
            await socket.sendMessage(sender, {
              text: '*⏳ Downloading your TikTok video...*'
            }, { quoted: msg });

            // Use tikwm.com API for downloading (same as your search function)
            const downloadUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;

            const response = await axios.get(downloadUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
              }
            });

            const data = response.data;

            if (data.code !== 0 || !data.data) {
              throw new Error(data.msg || 'Failed to fetch video');
            }

            const videoData = data.data;

            // Get video URL (prefer HD, then play/wm)
            const videoUrl = videoData.hdplay || videoData.play || videoData.wm || videoData.download;

            if (!videoUrl) {
              throw new Error('No video URL found');
            }

            // Get bot name dynamically
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            let cfg = await loadUserConfigFromMongo(sanitized) || {};
            let botName = cfg.botName || BOT_NAME_FANCY;

            // Create caption
            const caption = `*${botName} TIKTOK DOWNLOADER*\n\n*----------------------------------------*\n*┃ 📌 Title:* ${videoData.title || 'No Title'}\n*┃ 👤 Author:* ${videoData.author?.nickname || 'Unknown'}\n*┃ 👍 Likes:* ${videoData.digg_count || 0}\n*┃ 💬 Comments:* ${videoData.comment_count || 0}\n*┃ 🔍  Shares:* ${videoData.share_count || 0}\n*┃ 📥 Downloads:* ${videoData.download_count || 0}\n*----------------------------------------*\n\n> *MADUSHANKA MD MINI BOT*`;

            // Send the video
            await socket.sendMessage(sender, {
              video: { url: videoUrl },
              caption: caption,
              gifPlayback: false
            }, { quoted: msg });

          } catch (error) {
            console.error('TikTok Download Error:', error);

            // Try alternative API if first one fails
            try {
              await socket.sendMessage(sender, {
                text: '*🔍  Trying alternative method...*'
              }, { quoted: msg });

              // Alternative API
              const altResponse = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`);
              const altData = altResponse.data;

              if (altData.data && altData.data.play) {
                const sanitized = (number || '').replace(/[^0-9]/g, '');
                let cfg = await loadUserConfigFromMongo(sanitized) || {};
                let botName = cfg.botName || BOT_NAME_FANCY;

                const caption = `*${botName} TIKTOK DOWNLOADER*\n\nTitle: ${altData.data.title || 'No Title'}\nAuthor: ${altData.data.author.nickname || 'Unknown'}`;

                await socket.sendMessage(sender, {
                  video: { url: altData.data.play },
                  caption: caption
                }, { quoted: msg });
              } else {
                throw new Error('Alternative API also failed');
              }

            } catch (altError) {
              console.error('Alternative API Error:', altError);

              await socket.sendMessage(sender, {
                text: `❌ *Download Failed!*\n\nError: ${error.message}\n\nPlease:\n1. Verify the TikTok link is correct\n2. Ensure the video is public\n3. Try again in a moment`
              }, { quoted: msg });
            }
          }

          break;
        }

        // Channel Follow Case

        case 'cfn': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const cfg = await loadUserConfigFromMongo(sanitized) || {};
          const botName = cfg.botName || BOT_NAME_FANCY;
          const logo = cfg.logo || config.RCD_IMAGE_PATH;

          const full = body.slice(config.PREFIX.length + command.length).trim();
          if (!full) {
            await socket.sendMessage(sender, { text: `❗ Provide input: .cfn <jid@newsletter> | emoji1,emoji2\nExample: .cfn 120363402094635383@newsletter | 🔍 ,❤️` }, { quoted: msg });
            break;
          }

          const admins = await loadAdminsFromMongo();
          const normalizedAdmins = (admins || []).map(a => (a || '').toString());
          const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
          const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
          if (!(isOwner || isAdmin)) {
            await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or configured admins can add follow channels.' }, { quoted: msg });
            break;
          }

          let jidPart = full;
          let emojisPart = '';
          if (full.includes('|')) {
            const split = full.split('|');
            jidPart = split[0].trim();
            emojisPart = split.slice(1).join('|').trim();
          } else {
            const parts = full.split(/\s+/);
            if (parts.length > 1 && parts[0].includes('@newsletter')) {
              jidPart = parts.shift().trim();
              emojisPart = parts.join(' ').trim();
            } else {
              jidPart = full.trim();
              emojisPart = '';
            }
          }

          const jid = jidPart;
          if (!jid || !jid.endsWith('@newsletter')) {
            await socket.sendMessage(sender, { text: '❗ Invalid JID. Example: 120363402094635383@newsletter' }, { quoted: msg });
            break;
          }

          let emojis = [];
          if (emojisPart) {
            emojis = emojisPart.includes(',') ? emojisPart.split(',').map(e => e.trim()) : emojisPart.split(/\s+/).map(e => e.trim());
            if (emojis.length > 20) emojis = emojis.slice(0, 20);
          }

          try {
            if (typeof socket.newsletterFollow === 'function') {
              await socket.newsletterFollow(jid);
            }

            await addNewsletterToMongo(jid, emojis);

            const emojiText = emojis.length ? emojis.join(' ') : '(default set)';

            // Meta mention for botName
            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CFN" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: `*✅ CHANNEL FOLLOWED AND SAVED ✅*\n\n*ID:* ${jid}\n*Emojis:* ${emojiText}\n*Saved By:* @${senderIdSimple}`,
              footer: `☘️ ${botName} Follow Channel`,
              mentions: [nowsender], // user mention
              buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Menu" }, type: 1 }],
              headerType: 4
            }, { quoted: metaQuote }); // <-- botName meta mention

          } catch (e) {
            console.error('cfn error', e);
            await socket.sendMessage(sender, { text: `❌ Failed to save/follow channel: ${e.message || e}` }, { quoted: msg });
          }
          break;
        }

        case 'chr': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const cfg = await loadUserConfigFromMongo(sanitized) || {};
          const botName = cfg.botName || BOT_NAME_FANCY;
          const logo = cfg.logo || config.RCD_IMAGE_PATH;

          const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');

          const q = body.split(' ').slice(1).join(' ').trim();
          if (!q.includes(',')) return await socket.sendMessage(sender, { text: "❌ Usage: chr <channelJid/messageId>,<emoji>" }, { quoted: msg });

          const parts = q.split(',');
          let channelRef = parts[0].trim();
          const reactEmoji = parts[1].trim();

          let channelJid = channelRef;
          let messageId = null;
          const maybeParts = channelRef.split('/');
          if (maybeParts.length >= 2) {
            messageId = maybeParts[maybeParts.length - 1];
            channelJid = maybeParts[maybeParts.length - 2].includes('@newsletter') ? maybeParts[maybeParts.length - 2] : channelJid;
          }

          if (!channelJid.endsWith('@newsletter')) {
            if (/^\d+$/.test(channelJid)) channelJid = `${channelJid}@newsletter`;
          }

          if (!channelJid.endsWith('@newsletter') || !messageId) {
            return await socket.sendMessage(sender, { text: '❌ Provide channelJid/messageId format.' }, { quoted: msg });
          }

          try {
            await socket.newsletterReactMessage(channelJid, messageId.toString(), reactEmoji);
            await saveNewsletterReaction(channelJid, messageId.toString(), reactEmoji, sanitized);

            // BotName meta mention
            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CHR" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: `*✅ REACTED SUCCESSFULLY ✅*\n\n*Channel:* ${channelJid}\n*Message:* ${messageId}\n*Emoji:* ${reactEmoji}\nBy: @${senderIdSimple}`,
              footer: `*❤️ ${botName} Reaction*`,
              mentions: [nowsender], // user mention
              buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Menu" }, type: 1 }],
              headerType: 4
            }, { quoted: metaQuote }); // <-- botName meta mention

          } catch (e) {
            console.error('chr command error', e);
            await socket.sendMessage(sender, { text: `❌ Failed to react: ${e.message || e}` }, { quoted: msg });
          }
          break;
        }

        //=====================hi,mk,pk===========

        case 'apkdownload':
        case 'apk': {
          try {
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
            const id = text.split(" ")[1]; // .apkdownload <id>

            // ✅ Load bot name dynamically
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            let cfg = await loadUserConfigFromMongo(sanitized) || {};
            let botName = cfg.botName || BOT_NAME_FANCY;

            // ✅ Fake Meta contact message
            const shonux = {
              key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
              },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            if (!id) {
              return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an APK package ID.*\n\nExample: .apkdownload com.whatsapp',
                buttons: [
                  { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: '📄 Menu' }, type: 1 }
                ]
              }, { quoted: shonux });
            }

            // ⏳ Notify start
            await socket.sendMessage(sender, { text: '*⏳ Fetching APK info...*' }, { quoted: shonux });

            // 🔍  Call API
            const apiUrl = `https://tharuzz-ofc-apis.vercel.app/api/download/apkdownload?id=${encodeURIComponent(id)}`;
            const { data } = await axios.get(apiUrl);

            if (!data.success || !data.result) {
              return await socket.sendMessage(sender, { text: '*❌ Failed to fetch APK info.*' }, { quoted: shonux });
            }

            const result = data.result;
            const caption = `📱 *${result.name}*\n\n` +
              `*🆔 Package:* \`${result.package}\`\n` +
              `*📦 Size:* ${result.size}\n` +
              `*🕒 Last Update:* ${result.lastUpdate}\n\n` +
              `> *${botName}*`;

            // 🔍  Send APK as document
            await socket.sendMessage(sender, {
              document: { url: result.dl_link },
              fileName: `${result.name}.apk`,
              mimetype: 'application/vnd.android.package-archive',
              caption: caption,
              jpegThumbnail: result.image ? await axios.get(result.image, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
            }, { quoted: shonux });

          } catch (err) {
            console.error("Error in APK download:", err);

            // Catch block Meta mention
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            let cfg = await loadUserConfigFromMongo(sanitized) || {};
            let botName = cfg.botName || BOT_NAME_FANCY;

            const shonux = {
              key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
              },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
          }
          break;
        }

        // 
        case 'දà· පනà·Š':
        case 'oni':
        case 'vv':
        case 'save': {
          try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg) {
              return await socket.sendMessage(sender, { text: '*❌ Please reply to a message (status/media) to save it.*' }, { quoted: msg });
            }

            try { await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } }); } catch (e) { }

            // 
            const saveChat = sender;

            if (quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.audioMessage || quotedMsg.documentMessage || quotedMsg.stickerMessage) {
              const media = await downloadQuotedMedia(quotedMsg);
              if (!media || !media.buffer) {
                return await socket.sendMessage(sender, { text: '❌ Failed to download media.' }, { quoted: msg });
              }

              if (quotedMsg.imageMessage) {
                await socket.sendMessage(saveChat, { image: media.buffer, caption: media.caption || '✅ Status Saved' });
              } else if (quotedMsg.videoMessage) {
                await socket.sendMessage(saveChat, { video: media.buffer, caption: media.caption || '✅ Status Saved', mimetype: media.mime || 'video/mp4' });
              } else if (quotedMsg.audioMessage) {
                await socket.sendMessage(saveChat, { audio: media.buffer, mimetype: media.mime || 'audio/mp4', ptt: media.ptt || false });
              } else if (quotedMsg.documentMessage) {
                const fname = media.fileName || `saved_document.${(await FileType.fromBuffer(media.buffer))?.ext || 'bin'}`;
                await socket.sendMessage(saveChat, { document: media.buffer, fileName: fname, mimetype: media.mime || 'application/octet-stream' });
              } else if (quotedMsg.stickerMessage) {
                await socket.sendMessage(saveChat, { image: media.buffer, caption: media.caption || '✅ Sticker Saved' });
              }

              await socket.sendMessage(sender, { text: '🔍  *Status Saved Successfully!*' }, { quoted: msg });

            } else if (quotedMsg.conversation || quotedMsg.extendedTextMessage) {
              const text = quotedMsg.conversation || quotedMsg.extendedTextMessage.text;
              await socket.sendMessage(saveChat, { text: `✅ *Status Saved*\n\n${text}` });
              await socket.sendMessage(sender, { text: '🔍  *Text Status Saved Successfully!*' }, { quoted: msg });
            } else {
              if (typeof socket.copyNForward === 'function') {
                try {
                  const key = msg.message?.extendedTextMessage?.contextInfo?.stanzaId || msg.key;
                  await socket.copyNForward(saveChat, msg.key, true);
                  await socket.sendMessage(sender, { text: '🔍  *Saved (Forwarded) Successfully!*' }, { quoted: msg });
                } catch (e) {
                  await socket.sendMessage(sender, { text: '❌ Could not forward the quoted message.' }, { quoted: msg });
                }
              } else {
                await socket.sendMessage(sender, { text: '❌ Unsupported quoted message type.' }, { quoted: msg });
              }
            }

          } catch (error) {
            console.error('❌ Save error:', error);
            await socket.sendMessage(sender, { text: '*❌ Failed to save status*' }, { quoted: msg });
          }
          break;
        }

        // 

        case 'alive': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            // Get current time for Sri Lanka (IST - UTC+5:30)
            const now = new Date();

            // Set Sri Lanka timezone
            const options = { timeZone: 'Asia/Colombo' };

            // Get current hour in Sri Lanka time
            const sriLankaTime = now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
            const sriLankaDate = new Date(sriLankaTime);
            const currentHour = sriLankaDate.getHours();

            let greeting;
            if (currentHour >= 5 && currentHour < 12) {
              greeting = 'Good Morning 🌅';
            } else if (currentHour >= 12 && currentHour < 18) {
              greeting = 'Good Afternoon';
            } else {
              greeting = 'Good Evening 🌇';
            }

            // Format date and day separately for Sri Lanka
            const optionsDate = {
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Colombo'
            };
            const formattedDate = sriLankaDate.toLocaleDateString('en-US', optionsDate);

            const optionsDay = {
              weekday: 'long',
              timeZone: 'Asia/Colombo'
            };
            const formattedDay = sriLankaDate.toLocaleDateString('en-US', optionsDay);

            // Format time for Sri Lanka
            const optionsTime = {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
              timeZone: 'Asia/Colombo'
            };
            const formattedTime = sriLankaDate.toLocaleTimeString('en-US', optionsTime);

            // Meta AI mention
            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            // 1. Send video note first
            const vnoteUrl = 'https://files.catbox.moe/dityqg.mp4';
            await socket.sendMessage(sender, {
              video: { url: vnoteUrl },
              ptv: true
            }, { quoted: metaQuote });

            await new Promise(resolve => setTimeout(resolve, 500));

            // 2. Then send alive message
            const startTime = socketCreationTime.get(number) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const text = `
*Hi 👋 ${BOT_NAME_FANCY} User*

*╭───────────╮*  
*│🗣️ Greeting :* ${greeting}
*│📅 Date  :* ${formattedDate}
*│📆 Day  :* ${formattedDay}
*│⌚ Time :* ${formattedTime} (IST)
*│📄 Bot Name :* ${BOT_NAME_FANCY}
*│👑 Owner :* ${config.OWNER_NAME || 'DCT'}
*│🏷️ Version :* 2.0.0
*│🎈 Platform :* ${process.env.PLATFORM || 'Heroku'}
*│⏳ Uptime :* ${hours}h ${minutes}m ${seconds}s
*│✏️ Prefix :* .
*╰───────────╯*
`;

            const buttons = [
              {
                buttonId: 'action',
                buttonText: {
                  displayText: 'Menu Options'
                },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'Click Here',
                    sections: [
                      {
                        title: `DCT MD`,
                        highlight_label: '',
                        rows: [
                          {
                            title: 'Menu',
                            description: 'Get Menu Commands',
                            id: `${config.PREFIX}menu`,
                          },
                          {
                            title: 'Settings',
                            description: 'updated settings',
                            id: `${config.PREFIX}settings`,
                          },
                          {
                            title: 'Alive',
                            description: 'Get Bot Speed',
                            id: `${config.PREFIX}alive`,
                          },
                          {
                            title: 'Ping',
                            description: 'Get Bot Speed',
                            id: `${config.PREFIX}ping`,
                          },
                        ],
                      },
                    ],
                  }),
                },
              },
            ]

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: ` *${botName}*`,
              buttons,
              headerType: 4
            }, { quoted: metaQuote });

          } catch (e) {
            console.error('alive error', e);
            await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
          }
          break;
        }
        // 2nd setting type
        case 'set': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            // Get current time for Sri Lanka (IST - UTC+5:30)
            const now = new Date();

            // Set Sri Lanka timezone
            const options = { timeZone: 'Asia/Colombo' };

            // Get current hour in Sri Lanka time
            const sriLankaTime = now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
            const sriLankaDate = new Date(sriLankaTime);
            const currentHour = sriLankaDate.getHours();

            let greeting;
            if (currentHour >= 5 && currentHour < 12) {
              greeting = 'Good Morning 🌅';
            } else if (currentHour >= 12 && currentHour < 18) {
              greeting = 'Good Afternoon';
            } else {
              greeting = 'Good Evening 🌇';
            }

            // Format date and day separately for Sri Lanka
            const optionsDate = {
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Colombo'
            };
            const formattedDate = sriLankaDate.toLocaleDateString('en-US', optionsDate);

            const optionsDay = {
              weekday: 'long',
              timeZone: 'Asia/Colombo'
            };
            const formattedDay = sriLankaDate.toLocaleDateString('en-US', optionsDay);

            // Format time for Sri Lanka
            const optionsTime = {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
              timeZone: 'Asia/Colombo'
            };
            const formattedTime = sriLankaDate.toLocaleTimeString('en-US', optionsTime);

            // Meta AI mention
            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            // 1. Send video note first
            const vnoteUrl = 'https://files.catbox.moe/dityqg.mp4';
            await socket.sendMessage(sender, {
              video: { url: vnoteUrl },
              ptv: true
            }, { quoted: metaQuote });

            await new Promise(resolve => setTimeout(resolve, 500));

            // 2. Then send alive message
            const startTime = socketCreationTime.get(number) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const text = `
◈━━━━━━━━━━━━━━◈
*Hi 👋 ${BOT_NAME_FANCY} User*

◈━━━━━━◈━━━━━━◈
*│🗣️ Greeting :* ${greeting}
◈━━━━━━◈━━━━━━◈

Change your settings 

If you want to change these settings 
type ${config.PREFIX}settings

Thanks for using this bot
◈━━━━━━━━━━━━━━◈
`;

            const buttons = [
              {
                buttonId: 'action',
                buttonText: {
                  displayText: 'Setting Options'
                },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'CLICK HERE',
                    sections: [
                      {
                        title: `ALL SETTING`,
                        highlight_label: '',
                        rows: [
                          {
                            title: 'public',
                            description: 'set bot public',
                            id: `${config.PREFIX}wtype public`,
                          },
                          {
                            title: 'Private',
                            description: 'set bot private',
                            id: `${config.PREFIX}wtype private`,
                          },
                          {
                            title: 'Inbox',
                            description: 'set bot inbox',
                            id: `${config.PREFIX}wtype inbox`,
                          },
                          {
                            title: 'Group',
                            description: 'set bot group',
                            id: `${config.PREFIX}wtype group`,
                          },
                          // 
                          {
                            title: 'Menu',
                            description: 'Get Menu Commands',
                            id: `${config.PREFIX}menu`,
                          },
                          {
                            title: 'Ping',
                            description: 'Get Bot Speed',
                            id: `${config.PREFIX}ping`,
                          },
                          // 
                          {
                            title: 'Typing on',
                            description: 'on typing',
                            id: `${config.PREFIX}autotyping on`,
                          },
                          {
                            title: 'Typing off',
                            description: 'off typing',
                            id: `${config.PREFIX}autotyping off`,
                          },
                          // 
                          {
                            title: 'Recording on',
                            description: 'auto recording on',
                            id: `${config.PREFIX}autorecording on`,
                          },
                          {
                            title: 'Recording off',
                            description: 'auto recording off',
                            id: `${config.PREFIX}autorecording off`,
                          },
                          // 
                          {
                            title: 'Online',
                            description: 'Always online',
                            id: `${config.PREFIX}botpresence online`,
                          },
                          {
                            title: 'Offline',
                            description: 'Always offline',
                            id: `${config.PREFIX}botpresence offline`,
                          },
                          // 
                          {
                            title: 'Status view on',
                            description: 'auto status view on',
                            id: `${config.PREFIX}rstatus on`,
                          },
                          {
                            title: 'Status view off',
                            description: 'auto status view off',
                            id: `${config.PREFIX}rstatus off`,
                          },
                          // 
                          {
                            title: 'Auto status react on',
                            description: 'Auto status react on',
                            id: `${config.PREFIX}arm on`,
                          },
                          {
                            title: 'Auto status view off',
                            description: 'Auto status react off',
                            id: `${config.PREFIX}arm off`,
                          },
                          // 
                          {
                            title: 'Call reject on',
                            description: 'Auto call reject on',
                            id: `${config.PREFIX}creject on`,
                          },
                          {
                            title: 'call reject off',
                            description: 'Auto call reject off',
                            id: `${config.PREFIX}creject off`,
                          },
                          // 
                          {
                            title: 'Msg read type all',
                            description: 'Auto all msg read',
                            id: `${config.PREFIX}mread all`,
                          },
                          {
                            title: 'Msg reading type cmd',
                            description: 'Auto cmd read',
                            id: `${config.PREFIX}mread cmd`,
                          },
                          {
                            title: 'All msg read off',
                            description: 'Not any msg read',
                            id: `${config.PREFIX}mread off`,
                          },
                        ],
                      },
                    ],
                  }),
                },
              },
            ]

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: ` *${botName}*`,
              buttons,
              headerType: 4
            }, { quoted: metaQuote });

          } catch (e) {
            console.error('alive error', e);
            await socket.sendMessage(sender, { text: '❌ Failed to send alive status.' }, { quoted: msg });
          }
          break;
        }

        // 

        case 'activesessions':
        case 'active':
        case 'bots': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            // Permission check - only owner and admins can use this
            const admins = await loadAdminsFromMongo();
            const normalizedAdmins = (admins || []).map(a => (a || '').toString());
            const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
            const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);

            if (!isOwner && !isAdmin) {
              await socket.sendMessage(sender, {
                text: '❌ Permission denied. Only bot owner or admins can check active sessions.'
              }, { quoted: msg });
              break;
            }

            const activeCount = activeSockets.size;
            const activeNumbers = Array.from(activeSockets.keys());

            // Meta AI mention
            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ACTIVESESSIONS" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            let text = `*📡 Active Sessions - ${botName}*\n\n`;
            text += `📊 *Total Active Sessions:* ${activeCount}\n\n`;

            if (activeCount > 0) {
              text += `📱 *Active Numbers:*\n`;
              activeNumbers.forEach((num, index) => {
                text += `${index + 1}. ${num}\n`;
              });
            } else {
              text += `⚠️ No active sessions found.`;
            }

            text += `\n*🕒 Checked at:* ${getSriLankaTimestamp()}`;

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: `*${botName}*`,
              buttons: [
                { buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Menu" }, type: 1 },
                { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: "📡 Ping" }, type: 1 }
              ],
              headerType: 4
            }, { quoted: metaQuote });

          } catch (e) {
            console.error('activesessions error', e);
            await socket.sendMessage(sender, {
              text: '❌ Failed to fetch active sessions information.'
            }, { quoted: msg });
          }
          break;
        }




        // 

        case 'ping': {
          try {
            const start = Date.now();

            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;
            const userTag = `@${sender.split("@")[0]}`;

            // Sri Lanka Time
            const now = new Date();
            const sriLankaTime = now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
            const sriLankaDate = new Date(sriLankaTime);
            const currentHour = sriLankaDate.getHours();

            let greeting;
            if (currentHour >= 5 && currentHour < 12) {
              greeting = 'Good Morning 🌅';
            } else if (currentHour >= 12 && currentHour < 18) {
              greeting = 'Good Afternoon ☀️';
            } else {
              greeting = 'Good Evening 🌇';
            }

            const formattedTime = sriLankaDate.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
              timeZone: 'Asia/Colombo'
            });

            // Runtime
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const end = Date.now();
            const latency = end - start;

            const speedStatus = latency < 200
              ? 'Excellent 🟢'
              : latency < 500
                ? 'Good 🟡'
                : 'Slow 🔍 ';

            const text = `
📍 PING RESULT

👤 USER : ${userTag}
🗣️ GREETING : ${greeting}
⌚ TIME : ${formattedTime}

⚡ SPEED : ${latency} ms
💻 RUNTIME : ${hours}h ${minutes}m ${seconds}s
📡 STATUS : ${speedStatus}

Thanks for using ${botName} 🚀
`;

            let imagePayload = String(logo).startsWith('http')
              ? { url: logo }
              : fs.readFileSync(logo);

            // 
            const buttons = [
              {
                buttonId: 'menu',
                buttonText: { displayText: '⬅️ Back To Menu' },
                type: 1
              },
              {
                buttonId: 'alive',
                buttonText: { displayText: '🤖 Alive' },
                type: 1
              }
            ];

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: `*${botName}*`,
              buttons: buttons,
              headerType: 4
            }, { quoted: msg });

          } catch (e) {
            console.error('ping error', e);
            await socket.sendMessage(sender, {
              text: '❌ Failed to test ping.'
            }, { quoted: msg });
          }
          break;
        }
        // 

        case 'system': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SYSTEM" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };


            const text = `
*☘️ System info for ${botName} ☘️*

*╭───────────◆*
*│🧻 OS:* ${os.type()} ${os.release()}
*│📡 Platform:* ${os.platform()}
*│🧠 CPU Cores:* ${os.cpus().length}
*│💾 Memory:* ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB
*╰───────────◆*
`;

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: `*${botName} System Info* `,
              buttons: [{ buttonId: `${config.PREFIX}menu`, buttonText: { displayText: "📄 Menu" }, type: 1 }],
              headerType: 4
            }, { quoted: metaQuote });

          } catch (e) {
            console.error('system error', e);
            await socket.sendMessage(sender, { text: 'âŒ Failed to get system info.' }, { quoted: msg });
          }
          break;
        }

        case 'csend':
        case 'csong': {
          try {
            // 🎧 react
            try {
              await socket.sendMessage(sender, {
                react: { text: "🎧", key: msg.key }
              });
            } catch { }

            const targetArg = args[0];
            const query = args.slice(1).join(" ").trim();

            if (!targetArg || !query) {
              return await socket.sendMessage(sender, {
                text: "*❌ Invalid format!*\nUse: `.csong <jid|number|channelId> <song name or YouTube url>`"
              }, { quoted: msg });
            }

            // 🔍  normalize targetJid
            let targetJid = targetArg;
            if (!targetJid.includes('@')) {
              if (/^\d{12,}$/.test(targetJid) || /^0029/.test(targetJid)) {
                if (!targetJid.endsWith('@newsletter')) targetJid = `${targetJid}@newsletter`;
              } else {
                targetJid = `${targetJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
              }
            }

            // 🔍  search or URL
            let ytUrl = query;
            if (!/^https?:\/\//i.test(query)) {
              const search = await yts(query);
              if (!search.videos.length) {
                return await socket.sendMessage(sender, {
                  text: "*❌ Song not found!*"
                }, { quoted: msg });
              }
              ytUrl = search.videos[0].url;
            }

            // 🔍  API CALL
            const apiUrl = `https://ytmp333-chama-woad.vercel.app/api/ytdl?url=${encodeURIComponent(ytUrl)}&format=mp3`;

            const apiResp = await axios.get(apiUrl).catch(() => null);

            if (!apiResp || !apiResp.data || !apiResp.data.success) {
              return await socket.sendMessage(sender, {
                text: "*❌ Failed to fetch song!*"
              }, { quoted: msg });
            }

            const { title, download } = apiResp.data;

            if (!download) {
              return await socket.sendMessage(sender, {
                text: "*❌ Download link not found!*"
              }, { quoted: msg });
            }

            // 🔍  temp files
            const tmpId = crypto.randomBytes(6).toString('hex');
            const tempMp3 = path.join(os.tmpdir(), `cs_${tmpId}.mp3`);
            const tempOpus = path.join(os.tmpdir(), `cs_${tmpId}.opus`);

            // 🔍  download mp3
            const resp = await axios.get(download, {
              responseType: 'arraybuffer',
              timeout: 120000
            }).catch(() => null);

            if (!resp) {
              return await socket.sendMessage(sender, {
                text: "*❌ Download failed!*"
              }, { quoted: msg });
            }

            fs.writeFileSync(tempMp3, Buffer.from(resp.data));

            // 🔍  convert to opus
            if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

            await new Promise((resolve, reject) => {
              ffmpeg(tempMp3)
                .noVideo()
                .audioCodec('libopus')
                .format('opus')
                .on('end', resolve)
                .on('error', reject)
                .save(tempOpus);
            });

            if (!fs.existsSync(tempOpus)) throw new Error("Conversion failed");

            // 🔍  get channel name
            let channelname = targetJid;
            try {
              if (typeof socket.newsletterMetadata === 'function') {
                const meta = await socket.newsletterMetadata("jid", targetJid);
                if (meta?.name) channelname = meta.name;
              }
            } catch { }

            // 🔍  get thumbnail
            function getYoutubeId(url) {
              const regExp = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
              const match = url.match(regExp);
              return match ? match[1] : null;
            }

            const videoId = getYoutubeId(ytUrl);
            const thumbUrl = videoId
              ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
              : null;

            // 🎧 caption
            const caption = `*CSONG PLAYER*
*Title:* ${title}
*Target:* ${channelname}
*Status:* Sending...`;

            // 📸 send thumbnail + caption
            try {
              if (thumbUrl) {
                await socket.sendMessage(targetJid, {
                  image: { url: thumbUrl },
                  caption: caption
                });
              } else {
                await socket.sendMessage(targetJid, { text: caption });
              }
            } catch {
              await socket.sendMessage(targetJid, { text: caption });
            }

            // ⏳ delay (cool effect)
            await new Promise(res => setTimeout(res, 2000));

            // 🎧 send voice note
            const opusBuffer = fs.readFileSync(tempOpus);

            await socket.sendMessage(targetJid, {
              audio: opusBuffer,
              mimetype: 'audio/ogg; codecs=opus',
              ptt: true
            });

            // ✅ notify sender
            await socket.sendMessage(sender, {
              text: `✅ *${title}*\nSent to *${channelname}* 🎶`
            }, { quoted: msg });

            // 🧹 cleanup
            try { fs.unlinkSync(tempMp3); } catch { }
            try { fs.unlinkSync(tempOpus); } catch { }

          } catch (e) {
            console.error("csong error:", e);
            await socket.sendMessage(sender, {
              text: "*❌ Error occurred! Try again later.*"
            }, { quoted: msg });
          }
          break;
        }



        case 'song': {

          const q = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            "";

          if (!q.trim()) {
            return await socket.sendMessage(sender, {
              text: '*❌ Need YouTube URL or Title.*'
            }, { quoted: msg });
          }

          const extractYouTubeId = (url) => {
            const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
            const match = url.match(regex);
            return match ? match[1] : null;
          };

          const normalizeYouTubeLink = (str) => {
            const id = extractYouTubeId(str);
            return id ? `https://www.youtube.com/watch?v=${id}` : null;
          };

          try {
            await socket.sendMessage(sender, {
              react: { text: "🔍 ", key: msg.key }
            });

            let videoUrl = normalizeYouTubeLink(q.trim());
            let videoData = null;

            if (!videoUrl) {
              const search = await yts(q.trim());
              const found = search?.videos?.[0];

              if (!found) {
                return await socket.sendMessage(sender, {
                  text: "*❌ No results found.*"
                }, { quoted: msg });
              }

              videoUrl = found.url;
              videoData = found;
            }

            // 🔍  NEW API
            const apiUrl = `https://ytmp333-chama-woad.vercel.app/api/ytdl?url=${encodeURIComponent(videoUrl)}&format=mp3`;

            const get = await axios.get(apiUrl).then(r => r.data).catch(() => null);

            if (!get || !get.success) {
              return await socket.sendMessage(sender, {
                text: "*❌ API Error. Try again later.*"
              }, { quoted: msg });
            }

            const title = get.title || "Unknown Title";
            const download_url = get.download;

            const videoId = extractYouTubeId(videoUrl);
            const shortUrl = `https://youtu.be/${videoId}`;
            const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

            // 🔍  FIXED FANCY CAPTION
            const caption = `╭━━━〔 🎵 *SONG DOWNLOADER* 〕━━━⬣
┃ 🎵 *Title:* ${title}
┃ 🔍  *URL:* ${shortUrl}
┃ 📥 *Choose format below*
╰━━━━━━━━━━━━━━━━━━⬣

> *${BOT_NAME_FANCY}*`;

            // 🔍  buttons (fixed emojis)
            const buttons = [
              {
                buttonId: 'song_doc',
                buttonText: { displayText: '📁 Document' },
                type: 1
              },
              {
                buttonId: 'song_audio',
                buttonText: { displayText: '🎵 Audio' },
                type: 1
              },
              {
                buttonId: 'song_ptt',
                buttonText: { displayText: '🎤 Voice Note' },
                type: 1
              }
            ];

            // 📸 send thumbnail + buttons
            const resMsg = await socket.sendMessage(sender, {
              image: { url: thumbnail },
              caption: caption,
              buttons: buttons,
              headerType: 4
            }, { quoted: msg });

            // 🔍  handler
            const handler = async (msgUpdate) => {
              try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received) return;

                const fromId = received.key.remoteJid || received.key.participant;
                if (fromId !== sender) return;

                const buttonResponse = received.message?.buttonsResponseMessage;
                if (buttonResponse) {
                  const contextId = buttonResponse.contextInfo?.stanzaId;
                  if (contextId !== resMsg.key.id) return;

                  const selectedId = buttonResponse.selectedButtonId;

                  await socket.sendMessage(sender, {
                    react: { text: "📥", key: received.key }
                  });

                  if (selectedId === 'song_doc') {
                    await socket.sendMessage(sender, {
                      document: { url: download_url },
                      mimetype: "audio/mpeg",
                      fileName: `${title}.mp3`
                    }, { quoted: received });

                  } else if (selectedId === 'song_audio') {
                    await socket.sendMessage(sender, {
                      audio: { url: download_url },
                      mimetype: "audio/mpeg"
                    }, { quoted: received });

                  } else if (selectedId === 'song_ptt') {
                    await socket.sendMessage(sender, {
                      audio: { url: download_url },
                      mimetype: "audio/mpeg",
                      ptt: true
                    }, { quoted: received });
                  }

                  socket.ev.off('messages.upsert', handler);
                }

              } catch (err) {
                console.error("Song handler error:", err);
                try { socket.ev.off('messages.upsert', handler); } catch { }
              }
            };

            socket.ev.on('messages.upsert', handler);

            // ⏳ auto stop
            setTimeout(() => {
              try { socket.ev.off('messages.upsert', handler); } catch { }
            }, 60000);

            await socket.sendMessage(sender, {
              react: { text: '✅', key: msg.key }
            });

          } catch (err) {
            console.error('Song case error:', err);
            await socket.sendMessage(sender, {
              text: "*❌ Error occurred while processing request*"
            }, { quoted: msg });
          }
          break;
        }


        case 'song2': {

          const q =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            "";

          if (!q.trim()) {
            return await socket.sendMessage(sender, {
              text: '*❌ Need YouTube URL or Title.*'
            }, { quoted: msg });
          }

          const extractYouTubeId = (url) => {
            const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
            const match = url.match(regex);
            return match ? match[1] : null;
          };

          const normalizeYouTubeLink = (str) => {
            const id = extractYouTubeId(str);
            return id ? `https://www.youtube.com/watch?v=${id}` : null;
          };

          try {
            await socket.sendMessage(sender, {
              react: { text: "🔍 ", key: msg.key }
            });

            let videoUrl = normalizeYouTubeLink(q.trim());

            // 🔍  search if not URL
            if (!videoUrl) {
              const search = await yts(q.trim());
              const found = search?.videos?.[0];

              if (!found) {
                return await socket.sendMessage(sender, {
                  text: "*❌ No results found.*"
                }, { quoted: msg });
              }

              videoUrl = found.url;
            }

            // 🔍  NEW API
            const apiUrl = `https://ytmp333-chama-woad.vercel.app/api/ytdl?url=${encodeURIComponent(videoUrl)}&format=mp3`;

            const get = await axios.get(apiUrl).then(r => r.data).catch(() => null);

            if (!get || !get.success) {
              return await socket.sendMessage(sender, {
                text: "*❌ API Error. Try again later.*"
              }, { quoted: msg });
            }

            const title = get.title || "Unknown Title";
            const download_url = get.download;

            const videoId = extractYouTubeId(videoUrl);
            const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

            // 🔍  CLEAN FANCY UI
            const caption = `╭━━━〔 🎵 SONG DOWNLOADER 〕━━━⬣
┃ 🎵 *Title:* ${title}
┃ 📥 *Select format below*
╰━━━━━━━━━━━━━━━━━━⬣

*Reply with number:*

1️⃣ Document (MP3)
2️⃣ Audio (MP3)
3️⃣ Voice Note (PTT)

> *${BOT_NAME_FANCY}*`;

            // 📸 send thumbnail + caption
            const resMsg = await socket.sendMessage(sender, {
              image: { url: thumbnail },
              caption: caption
            }, { quoted: msg });

            // 🔍  reply handler
            const handler = async (msgUpdate) => {
              try {
                const received = msgUpdate.messages && msgUpdate.messages[0];
                if (!received) return;

                const fromId = received.key.remoteJid || received.key.participant;
                if (fromId !== sender) return;

                const text = received.message?.conversation ||
                  received.message?.extendedTextMessage?.text;
                if (!text) return;

                const quotedId =
                  received.message?.extendedTextMessage?.contextInfo?.stanzaId ||
                  received.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key?.id;

                if (!quotedId || quotedId !== resMsg.key.id) return;

                const choice = text.trim();

                await socket.sendMessage(sender, {
                  react: { text: "📥", key: received.key }
                });

                if (choice === "1") {
                  await socket.sendMessage(sender, {
                    document: { url: download_url },
                    mimetype: "audio/mpeg",
                    fileName: `${title}.mp3`
                  }, { quoted: received });

                } else if (choice === "2") {
                  await socket.sendMessage(sender, {
                    audio: { url: download_url },
                    mimetype: "audio/mpeg"
                  }, { quoted: received });

                } else if (choice === "3") {
                  await socket.sendMessage(sender, {
                    audio: { url: download_url },
                    mimetype: "audio/mpeg",
                    ptt: true
                  }, { quoted: received });

                } else {
                  await socket.sendMessage(sender, {
                    text: "*❌ Invalid option. Reply 1, 2 or 3.*"
                  }, { quoted: received });
                  return;
                }

                socket.ev.off('messages.upsert', handler);

              } catch (err) {
                console.error("Song2 handler error:", err);
                try { socket.ev.off('messages.upsert', handler); } catch { }
              }
            };

            socket.ev.on('messages.upsert', handler);

            // ⏳ timeout
            setTimeout(() => {
              try { socket.ev.off('messages.upsert', handler); } catch { }
            }, 60000);

            await socket.sendMessage(sender, {
              react: { text: '✅', key: msg.key }
            });

          } catch (err) {
            console.error('Song2 error:', err);
            await socket.sendMessage(sender, {
              text: "*❌ Error occurred while processing request*"
            }, { quoted: msg });
          }

          break;
        }



        // ðƒá´„á´› ð—–Ê€ɪᴍɪɴá´€ÊŸ ðŒð™³ ð—¡á´‡ᴡêœ± ð—–á´€êœ±á´‡

        case 'news': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;
            const logo = cfg.logo || config.RCD_IMAGE_PATH;


            // Get current time for Sri Lanka (IST - UTC+5:30)
            const now = new Date();

            // Set Sri Lanka timezone
            const options = { timeZone: 'Asia/Colombo' };

            // Get current hour in Sri Lanka time
            const sriLankaTime = now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' });
            const sriLankaDate = new Date(sriLankaTime);
            const currentHour = sriLankaDate.getHours();

            let greeting;
            if (currentHour >= 5 && currentHour < 12) {
              greeting = 'Good Morning 🌅';
            } else if (currentHour >= 12 && currentHour < 18) {
              greeting = 'Good Afternoon';
            } else {
              greeting = 'Good Evening ðŸŒ™';
            }

            // Format date and day separately for Sri Lanka
            const optionsDate = {
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Colombo'
            };
            const formattedDate = sriLankaDate.toLocaleDateString('en-US', optionsDate);

            const optionsDay = {
              weekday: 'long',
              timeZone: 'Asia/Colombo'
            };
            const formattedDay = sriLankaDate.toLocaleDateString('en-US', optionsDay);

            // Format time for Sri Lanka
            const optionsTime = {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
              timeZone: 'Asia/Colombo'
            };
            const formattedTime = sriLankaDate.toLocaleTimeString('en-US', optionsTime);

            // Meta AI mention
            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            // 1. Send video note first
            const vnoteUrl = 'https://files.catbox.moe/dityqg.mp4';
            await socket.sendMessage(sender, {
              video: { url: vnoteUrl },
              ptv: true
            }, { quoted: metaQuote });

            await new Promise(resolve => setTimeout(resolve, 500));


            const text = `
*𝙃𝙄 👋 ${BOT_NAME_FANCY} 𝙈𝙄𝙉𝙄 𝘽𝙊𝙏 𝙐𝙎𝙀𝙍*

*┃💬 Greeting :* ${greeting}
𝙈𝘼𝘿𝙐𝙎𝙃𝘼𝙉𝙆𝘼 𝙈𝘿 𝙈𝙄𝙉𝙄 𝘽𝙊𝙏
BEST CUSTOMER SERVICE USER

THANKS FOR USING THIS BOT
`;

            const buttons = [
              {
                buttonId: 'action',
                buttonText: {
                  title: `DAILY NEWS 🍃`,
                },
                type: 4,
                nativeFlowInfo: {
                  name: 'single_select',
                  paramsJson: JSON.stringify({
                    title: 'CLICK HERE',
                    sections: [
                      {
                        title: `DAILY NEWS 🍃`,
                        highlight_label: 'NEWS UPDATES',
                        rows: [
                          {
                            title: 'ADANEWS 🌅',
                            description: 'Ada news update',
                            id: `${config.PREFIX}ada`,
                          },
                          {
                            title: 'HIRUNEWS ☀️',
                            description: 'Hiru news update',
                            id: `${config.PREFIX}hiru`,
                          },
                          {
                            title: 'SIRASANEWS 🔍',
                            description: 'Sirasa news update',
                            id: `${config.PREFIX}sirasa`,
                          },
                          {
                            title: 'ITNNEWS ⛩️',
                            description: 'Itn news update',
                            id: `${config.PREFIX}itn`,
                          },
                          // පà·ƒà·Šà·ƒà·™ à¶šà·‘ලà·Šල මà·™තනට
                          {
                            title: 'LNWNEWS 🔍 ',
                            description: 'Lnw news update',
                            id: `${config.PREFIX}lnw`,
                          },
                          {
                            title: 'BBCNEWS 📉',
                            description: 'BBC news update',
                            id: `${config.PREFIX}bbc`,
                          },
                          // මà·™තනට ටයà·’පà·’නà·Š
                          {
                            title: 'DASATHALANKA 🗺️',
                            description: 'Dasatha news update',
                            id: `${config.PREFIX}dasathalanka`,
                          },
                          {
                            title: 'êœ±ɪʏá´€á´›á´€ 🌊',
                            description: 'Siyatha news update',
                            id: `${config.PREFIX}siyatha`,
                          },
                          // රà·™à¶šෝඩà·’නà·Š à¶‘à¶š මà·™තනට
                          {
                            title: 'LANKADEEPA 🔍',
                            description: 'Lankadeepa news update',
                            id: `${config.PREFIX}lankadeepa`,
                          },
                          {
                            title: 'GAGANA 📦',
                            description: 'Gagana news update',
                            id: `${config.PREFIX}gagana`,
                          },
                          // මà·™තනට තà·€ මà·œà¶šà¶šà·Š à·„රà·’

                        ],
                      },
                    ],
                  }),
                },
              },
            ]

            let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: ` *${botName}*`,
              buttons,
              headerType: 4
            }, { quoted: metaQuote });

          } catch (e) {
            console.error('alive error', e);
            await socket.sendMessage(sender, { text: 'âŒ Failed to send alive status.' }, { quoted: msg });
          }
          break;
        }

        case 'siyatha': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SIYATHA" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/siyatha?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch Siyatha News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *SIYATHA NEWS : ${n.title}*

📅 Date : ${n.date}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('siyatha error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Siyatha News.' });
          }
          break;
        }

        case 'bbc': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_BBC" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/bbc?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch BBC News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *BBC NEWS : ${n.title}*

📅 Date : ${n.date}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('bbc error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching BBC News.' });
          }
          break;
        }

        case 'lnw': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_LNW" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/lnw?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch LNW News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *LNW NEWS : ${n.title}*

📅 Date : ${n.date}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('lnw error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching LNW News.' });
          }
          break;
        }
        case 'img': {
          const q = body.replace(/^[.\/!]img\s*/i, '').trim();

          if (!q) return await socket.sendMessage(sender, {
            text: '🔍 Please provide a search query. Ex: .img sunset'
          }, { quoted: msg });

          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_IMG" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get(`https://allstars-apis.vercel.app/pinterest?search=${encodeURIComponent(q)}`);
            const data = res.data?.data;

            if (!data || data.length === 0)
              return await socket.sendMessage(sender, { text: '❌ No images found.' }, { quoted: botMention });

            const randomImage = data[Math.floor(Math.random() * data.length)];

            await socket.sendMessage(sender, {
              image: { url: randomImage },
              caption: `🖼️ IMAGE SEARCH : ${q}\n\n> ${botName}`,
              buttons: [{
                buttonId: `${config.PREFIX}img ${q}`,
                buttonText: { displayText: "⏩ Next Image" },
                type: 1
              }],
              headerType: 4,
              contextInfo: { mentionedJid: [sender] }
            }, { quoted: botMention });

          } catch (err) {
            console.error("img error:", err);
            await socket.sendMessage(sender, { text: '❌ Failed to fetch images.' });
          }

          break;
        }
        case 'dasathalanka': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_DASA" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/dasathalanka?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch Dasa Thalanka News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *DASATHALANKA NEWS : ${n.title}*

📅 Date : ${n.date}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('dasathalanka error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Dasa Thalanka News.' });
          }
          break;
        }
        case 'itn': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_ITN" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/itn?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch ITN News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *ITN NEWS : ${n.title}*

📅 Date : ${n.date}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('itn error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching ITN News.' });
          }
          break;
        }
        case 'hiru': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_HIRU" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/hiru?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch Hiru News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *HIRU NEWS : ${n.title}*

📅 Date : ${n.date}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('hiru error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Hiru News.' });
          }
          break;
        }
        case 'ada': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_ADA" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/ada');
            if (!res.data?.status || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch Ada News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *ADA NEWS : ${n.title}*

📅 Date : ${n.date}
⏰ Time : ${n.time}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('ada error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Ada News.' });
          }
          break;
        }
        case 'sirasa': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_SIRASA" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/sirasa');
            if (!res.data?.status || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch Sirasa News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *SIRASA NEWS : ${n.title}*

📅 Date : ${n.date}
⏰ Time : ${n.time}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('sirasa error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Sirasa News.' });
          }
          break;
        }
        case 'lankadeepa': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_LANKA" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/lankadeepa');
            if (!res.data?.status || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch Lankadeepa News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *LANKADEEPA NEWS : ${n.title}*

📅 Date : ${n.date}
⏰ Time : ${n.time}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('lankadeepa error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Lankadeepa News.' });
          }
          break;
        }
        case 'gagana': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_GAGANA" },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/gagana');
            if (!res.data?.status || !res.data.result)
              return await socket.sendMessage(sender, { text: '❌ Failed to fetch Gagana News.' }, { quoted: botMention });

            const n = res.data.result;

            const caption = `📰 *GAGANA NEWS : ${n.title}*

📅 Date : ${n.date}
⏰ Time : ${n.time}

${n.desc}

🔗 Read More : ${n.url}

> ${botName}`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('gagana error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Gagana News.' });
          }
          break;
        }


        case 'getdp': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};

            const botName = cfg.botName || "𝐌𝐀𝐃𝐔𝐒𝐀𝐍𝐊𝐀 𝐌𝐃 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓";
            const logo = cfg.logo || config.RCD_IMAGE_PATH;

            // ✅ get number from message
            let q = msg.message?.conversation?.split(" ")[1] ||
              msg.message?.extendedTextMessage?.text?.split(" ")[1];

            if (!q) {
              return await socket.sendMessage(sender, {
                text: `❌ Please provide a number!\n\nUsage: ${config.PREFIX}getdp 947XXXXXXXX`
              });
            }

            // ✅ format JID
            let jid = q.replace(/[^0-9]/g, '') + "@s.whatsapp.net";

            // ✅ get profile picture
            let ppUrl;
            try {
              ppUrl = await socket.profilePictureUrl(jid, "image");
            } catch {
              ppUrl = "https://files.catbox.moe/ditu9f.jpeg"; // default fallback
            }

            // ✅ meta quote (clean version)
            const metaQuote = {
              key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "GETDP_META"
              },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
FN:${botName}
ORG:${botName}
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            // ✅ send DP
            await socket.sendMessage(sender, {
              image: { url: ppUrl },
              caption: `
╭━━〔 🖼️ *PROFILE PICTURE* 〕━━⬣
┃ 📱 Number : +${q}
┃ 🤖 Bot : ${botName}
╰━━━━━━━━━━━━━━━━━━⬣
> ⚡ Fast DP Fetcher
      `.trim(),
              footer: `🍁 ${botName}`,
              buttons: [
                {
                  buttonId: `${config.PREFIX}menu`,
                  buttonText: { displayText: "📑 Menu" },
                  type: 1
                }
              ],
              headerType: 4
            }, { quoted: metaQuote });

          } catch (e) {
            console.log("❌ getdp error:", e);

            await socket.sendMessage(sender, {
              text: "⚠️ Error: Could not fetch profile picture."
            });
          }

          break;
        }



        case 'owner': {
          try {
            await socket.sendMessage(sender, {
              react: { text: "🥷", key: msg.key }
            });
          } catch (e) { }

          // ✅ BOT NAME
          const BOT_NAME = "𝐌𝐀𝐃𝐔𝐒𝐀𝐍𝐊𝐀 𝐌𝐃 𝐌𝐈𝐍𝐈 𝐁𝐎𝐓";

          // ✅ OWNER DETAILS
          const ownerName = "𝐌𝐀𝐃𝐔𝐒𝐀𝐍𝐊𝐀 𝐌𝐃";
          const ownerNumber = "94783731694"; // without +
          const displayNumber = "+94 78 373 1694";
          const email = "owner@email.com"; // optional

          // ✅ VCARD
          const vcard =
            `BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
ORG:${BOT_NAME}
TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${displayNumber}
EMAIL:${email}
END:VCARD`;

          // ✅ SEND CONTACT
          await socket.sendMessage(sender, {
            contacts: {
              displayName: ownerName,
              contacts: [{ vcard }]
            }
          });

          // ✅ PREMIUM MESSAGE
          const text = `
╭━━〔 🤖 *${BOT_NAME}* 〕━━⬣
┃ 👤 Owner : ${ownerName}
┃ 📞 Number : ${displayNumber}
┃ 📧 Email : ${email || "Not Provided"}
╰━━━━━━━━━━━━━━━━━━⬣
> ⚡ Fast • Secure • Powerful Bot
`.trim();

          await socket.sendMessage(sender, { text });

          break;
        }


        case 'tagall': {
          try {
            if (!from || !from.endsWith('@g.us')) return await socket.sendMessage(sender, { text: 'âŒ This command can only be used in groups.' }, { quoted: msg });

            let gm = null;
            try { gm = await socket.groupMetadata(from); } catch (e) { gm = null; }
            if (!gm) return await socket.sendMessage(sender, { text: 'âŒ Failed to fetch group info.' }, { quoted: msg });

            const participants = gm.participants || [];
            if (!participants.length) return await socket.sendMessage(sender, { text: 'âŒ No members found in the group.' }, { quoted: msg });

            const text = args && args.length ? args.join(' ') : '📢 Announcement';

            let groupPP = 'https://i.ibb.co/9q2mG0Q/default-group.jpg';
            try { groupPP = await socket.profilePictureUrl(from, 'image'); } catch (e) { }

            const mentions = participants.map(p => p.id || p.jid);
            const groupName = gm.subject || 'Group';
            const totalMembers = participants.length;

            const emojis = ['📢', 'ðŸ”Š', 'ðŸŒ', 'ðŸ›¡️', 'ðŸš€', '🎡¯', 'ðŸ§¿', 'ðŸª©', 'ðŸŒ€', '💤 ', '🎡Š', '🎧', '📋£', 'ðŸ—£️'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY;

            // BotName meta mention
            const metaQuote = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TAGALL" },
              message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            let caption = `*╭━━━━━━━━━━━━━━╮*\n`;
            caption += `*🏷️ ɢʀᴏᴜᴘ:* ${groupName}\n`;
            caption += `*👥 ᴍᴇᴍʙᴇʀꜱ:* ${totalMembers}\n`;
            caption += `*💬 ᴍᴇꜱꜱᴀɢᴇ:* ${text}\n`;
            caption += `*◈━━━━━━━━━━━━━━◈*\n\n`;
            caption += `*📢 ᴍᴇɴᴛɪᴏɴꜱ ᴀʟʟ ᴍᴇᴍʙᴇʀꜱ*\n\n`;
            for (const m of participants) {
              const id = (m.id || m.jid);
              if (!id) continue;
              caption += `${randomEmoji} @${id.split('@')[0]}\n`;
            }
            caption += `\n> *${botName}*`;

            await socket.sendMessage(from, {
              image: { url: groupPP },
              caption,
              mentions,
            }, { quoted: metaQuote }); // <-- botName meta mention

          } catch (err) {
            console.error('tagall error', err);
            await socket.sendMessage(sender, { text: 'âŒ Error running tagall.' }, { quoted: msg });
          }
          break;
        }

        case 'hidetag': {
          if (!isGroup) return await socket.sendMessage(sender, { text: 'âŒ This command works only in groups.' }, { quoted: msg });
          if (!isOwnerCaller && !isGroupAdminCaller) return await socket.sendMessage(sender, { text: 'âŒ Admins only.' }, { quoted: msg });

          const text = args.join(' ') || '';
          const groupMeta = await socket.groupMetadata(from);
          const participants = (groupMeta.participants || []).map(p => p.id);

          await socket.sendMessage(from, { text, mentions: participants });
          break;
        }

        case 'poll': {
          const content = args.join(' ');
          if (!content.includes('|')) return await socket.sendMessage(sender, { text: 'âŒ Usage: .poll Question | opt1,opt2' }, { quoted: msg });
          const [name, valuesRaw] = content.split('|');
          const values = valuesRaw.split(',').map(v => v.trim()).filter(v => v);

          await socket.sendMessage(from, {
            poll: {
              name: name.trim(),
              values: values,
              selectableCount: 1
            }
          });
          break;
        }

        case 'event': {
          const content = args.join(' ');
          if (!content.includes('|')) return await socket.sendMessage(sender, { text: 'âŒ Usage: .event Name | Desc | Loc' }, { quoted: msg });
          const parts = content.split('|').map(p => p.trim());
          const name = parts[0];
          const desc = parts[1] || '';
          const loc = parts[2] || '';

          await socket.sendMessage(from, {
            event: {
              isCanceled: false,
              name: name,
              description: desc,
              location: { degreesLatitude: 0, degreesLongitude: 0 },
              startTime: Math.floor(Date.now() / 1000) + 3600,
              endTime: Math.floor(Date.now() / 1000) + 7200,
              extraGuestsAllowed: true
            }
          });
          break;
        }

        case 'add': {
          if (!isGroup) return await socket.sendMessage(sender, { text: 'âŒ Groups only.' }, { quoted: msg });
          if (!isOwnerCaller && !isGroupAdminCaller) return await socket.sendMessage(sender, { text: 'âŒ Admins only.' }, { quoted: msg });
          const target = args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;
          if (!target) return await socket.sendMessage(sender, { text: 'âŒ Provide number.' }, { quoted: msg });
          try {
            await socket.groupParticipantsUpdate(from, [target], 'add');
            await socket.sendMessage(sender, { text: '✅ Added!' });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
          }
          break;
        }

        case 'kick': {
          if (!isGroup) return await socket.sendMessage(sender, { text: 'âŒ Groups only.' }, { quoted: msg });
          if (!isOwnerCaller && !isGroupAdminCaller) return await socket.sendMessage(sender, { text: 'âŒ Admins only.' }, { quoted: msg });
          let target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
            msg.message?.extendedTextMessage?.contextInfo?.participant ||
            (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
          if (!target) return await socket.sendMessage(sender, { text: 'âŒ Tag or provide number.' }, { quoted: msg });
          try {
            await socket.groupParticipantsUpdate(from, [target], 'remove');
            await socket.sendMessage(sender, { text: '✅ Kicked!' });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
          }
          break;
        }

        case 'promote': {
          if (!isGroup) return await socket.sendMessage(sender, { text: 'âŒ Groups only.' }, { quoted: msg });
          if (!isOwnerCaller && !isGroupAdminCaller) return await socket.sendMessage(sender, { text: 'âŒ Admins only.' }, { quoted: msg });
          let target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
            msg.message?.extendedTextMessage?.contextInfo?.participant ||
            (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
          if (!target) return await socket.sendMessage(sender, { text: 'âŒ Tag or provide number.' }, { quoted: msg });
          try {
            await socket.groupParticipantsUpdate(from, [target], 'promote');
            await socket.sendMessage(sender, { text: '✅ Promoted!' });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
          }
          break;
        }

        case 'demote': {
          if (!isGroup) return await socket.sendMessage(sender, { text: 'âŒ Groups only.' }, { quoted: msg });
          if (!isOwnerCaller && !isGroupAdminCaller) return await socket.sendMessage(sender, { text: 'âŒ Admins only.' }, { quoted: msg });
          let target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
            msg.message?.extendedTextMessage?.contextInfo?.participant ||
            (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);
          if (!target) return await socket.sendMessage(sender, { text: 'âŒ Tag or provide number.' }, { quoted: msg });
          try {
            await socket.groupParticipantsUpdate(from, [target], 'demote');
            await socket.sendMessage(sender, { text: '✅ Demoted!' });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
          }
          break;
        }

        case 'group': {
          if (!isGroup) return await socket.sendMessage(sender, { text: 'âŒ Groups only.' }, { quoted: msg });
          if (!isOwnerCaller && !isGroupAdminCaller) return await socket.sendMessage(sender, { text: 'âŒ Admins only.' }, { quoted: msg });
          const opt = args[0]?.toLowerCase();
          if (opt === 'open') {
            await socket.groupSettingUpdate(from, 'not_announcement');
            await socket.sendMessage(sender, { text: '✅ Group opened!' });
          } else if (opt === 'close') {
            await socket.groupSettingUpdate(from, 'announcement');
            await socket.sendMessage(sender, { text: '✅ Group closed!' });
          } else if (opt === 'lock') {
            await socket.groupSettingUpdate(from, 'locked');
            await socket.sendMessage(sender, { text: '✅ Settings locked!' });
          } else if (opt === 'unlock') {
            await socket.groupSettingUpdate(from, 'unlocked');
            await socket.sendMessage(sender, { text: '✅ Settings unlocked!' });
          } else {
            await socket.sendMessage(sender, { text: 'âŒ Usage: .group open/close/lock/unlock' });
          }
          break;
        }

        case 'groupcreate': {
          if (!isOwnerCaller) return await socket.sendMessage(sender, { text: 'âŒ Owner only.' });
          const content = args.join(' ');
          if (!content.includes('|')) return await socket.sendMessage(sender, { text: 'âŒ Usage: .groupcreate Name | number1,number2' });
          const [name, participantsRaw] = content.split('|');
          const p = participantsRaw.split(',').map(v => v.trim().replace(/[^0-9]/g, '') + '@s.whatsapp.net');
          try {
            const group = await socket.groupCreate(name.trim(), p);
            await socket.sendMessage(sender, { text: '✅ Group created! ID: ' + group.id });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
          }
          break;
        }

        case 'invite': {
          if (!isGroup) return await socket.sendMessage(sender, { text: 'âŒ Groups only.' });
          try {
            const code = await socket.groupInviteCode(from);
            await socket.sendMessage(sender, { text: 'https://chat.whatsapp.com/' + code });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
            await socket.sendMessage(sender, { text: '❌ Error: ' + e.message });
          }
          break;
        }

        case 'revoke': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' });
          if (!isOwnerCaller && !isGroupAdminCaller) return await socket.sendMessage(sender, { text: '❌ Admins only.' });
          try {
            const code = await socket.groupRevokeInvite(from);
            await socket.sendMessage(sender, { text: '✅ Revoked! New link: https://chat.whatsapp.com/' + code });
          } catch (e) {
            await socket.sendMessage(sender, { text: '❌ Error: ' + e.message });
          }
          break;
        }

        case 'groupinfo': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' });
          const gm = await socket.groupMetadata(from);
          const caption = `
☘️ *GROUP INFO*

📌 *Name:* ${gm.subject}
🆔 *Id:* ${gm.id}
👑 *Owner:* ${gm.owner || 'N/A'}
👥 *Members:* ${gm.participants.length}
📅*Created:* ${new Date(gm.creation * 1000).toLocaleString()}
📋 *Desc:* ${gm.desc || 'No description'}

> *${BOT_NAME_FANCY}*
`;
          await socket.sendMessage(sender, { text: caption.trim() }, { quoted: msg });
          break;
        }

        case 'cinfo': {
          const jid = args[0] || config.NEWSLETTER_JID;
          if (!jid) return await socket.sendMessage(sender, { text: '❌ Provide JID.' });
          try {
            const meta = await socket.newsletterMetadata('jid', jid);
            const infoText = `
*NEWSLETTER INFO*

*Name:* ${meta.name}
*Id:* ${meta.id}
*Subscribers:* ${meta.subscribers?.toLocaleString() || 'N/A'}
*Role:* ${meta.viewer_metadata?.role || 'Viewer'}
*Desc:* ${meta.description || 'No description'}

> *${BOT_NAME_FANCY}*
`;
            await socket.sendMessage(sender, { text: infoText.trim() });
          } catch (e) {
            await socket.sendMessage(sender, { text: '❌ Error: ' + e.message });
          }
          break;
        }

        case 'cjoin': {
          const jid = args[0];
          if (!jid) return await socket.sendMessage(sender, { text: 'âŒ Provide JID.' });
          try {
            await socket.newsletterAction(jid, 'follow');
            await socket.sendMessage(sender, { text: '✅ Followed channel!' });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
          }
          break;
        }

        case 'cleave': {
          const jid = args[0];
          if (!jid) return await socket.sendMessage(sender, { text: 'âŒ Provide JID.' });
          try {
            await socket.newsletterAction(jid, 'unfollow');
            await socket.sendMessage(sender, { text: '✅ Unfollowed channel!' });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
          }
          break;
        }

        case 'cmute': {
          const jid = args[0];
          if (!jid) return await socket.sendMessage(sender, { text: '❌ Provide JID.' });
          try {
            await socket.newsletterAction(jid, 'mute');
            await socket.sendMessage(sender, { text: '✅ Muted channel!' });
          } catch (e) {
            await socket.sendMessage(sender, { text: '❌ Error: ' + e.message });
          }
          break;
        }

        case 'cunmute': {
          const jid = args[0];
          if (!jid) return await socket.sendMessage(sender, { text: '❌ Provide JID.' });
          try {
            await socket.newsletterAction(jid, 'unmute');
            await socket.sendMessage(sender, { text: '✅ Unmuted channel!' });
          } catch (e) {
            await socket.sendMessage(sender, { text: '❌ Error: ' + e.message });
          }
          break;
        }

        case 'clist': {
          try {
            const list = await socket.newsletterList();
            let text = `📋 *FOLLOWED CHANNELS* (${BOT_NAME_FANCY})\n\n`;
            list.forEach((c, idx) => {
              text += `${idx + 1}. *${c.name}*\nID: ${c.id}\n\n`;
            });
            await socket.sendMessage(sender, { text: text.trim() });
          } catch (e) {
            await socket.sendMessage(sender, { text: '❌ Error: ' + e.message });
          }
          break;
        }

        case 'ccreate': {
          if (!isOwnerCaller) return await socket.sendMessage(sender, { text: 'âŒ Owner only.' });
          const content = args.join(' ');
          if (!content) return await socket.sendMessage(sender, { text: 'âŒ Usage: .ccreate Name' });
          try {
            const ns = await socket.newsletterCreate(content);
            await socket.sendMessage(sender, { text: '✅ Channel created!\nID: ' + ns.id });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
          }
          break;
        }

        case 'cupdate': {
          if (!isOwnerCaller) return await socket.sendMessage(sender, { text: 'âŒ Owner only.' });
          const content = args.join(' ');
          if (!content.includes('|')) return await socket.sendMessage(sender, { text: 'âŒ Usage: .cupdate JID | Name | Desc' });
          const [jid, name, desc] = content.split('|').map(v => v.trim());
          try {
            await socket.newsletterUpdate(jid, { name, description: desc });
            await socket.sendMessage(sender, { text: '✅ Channel updated!' });
          } catch (e) {
            await socket.sendMessage(sender, { text: 'âŒ Error: ' + e.message });
          }
          break;
        }

        // ðƒá´„á´› ð—–Ê€ɪᴍɪɴá´€ÊŸ ðŒð™³ ð— á´‡á´…ɪá´€êœ°ɪÊ€á´‡ ð—–á´€êœ±á´‡

        case 'mediafire':
        case 'mf':
        case 'mfdl': {
          try {
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
            const url = text.split(" ")[1]; // .mediafire <link>

            // ✅ Load bot name dynamically
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            let cfg = await loadUserConfigFromMongo(sanitized) || {};
            let botName = cfg.botName || BOT_NAME_FANCY;

            // ✅ Fake Meta contact message (like Facebook style)
            const shonux = {
              key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_MEDIAFIRE"
              },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            if (!url) {
              return await socket.sendMessage(sender, {
                text: '🚫 *Please send a MediaFire link.*\n\nExample: .mediafire <url>'
              }, { quoted: shonux });
            }

            // ⏳ Notify start
            await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } });
            await socket.sendMessage(sender, { text: '*⏳ Fetching MediaFire file info...*' }, { quoted: shonux });

            // 🔍  Call API
            let api = `https://tharuzz-ofc-apis.vercel.app/api/download/mediafire?url=${encodeURIComponent(url)}`;
            let { data } = await axios.get(api);

            if (!data.success || !data.result) {
              return await socket.sendMessage(sender, { text: 'âŒ *Failed to fetch MediaFire file.*' }, { quoted: shonux });
            }

            const result = data.result;
            const title = result.title || result.filename;
            const filename = result.filename;
            const fileSize = result.size;
            const downloadUrl = result.url;

            const caption = `📦 *${title}*\n\n` +
              `📁 *Filename :* ${filename}\n` +
              `💾 *Size :* ${fileSize}\n` +
              `🌍 *From :* ${result.from}\n` +
              `📅 *Date :* ${result.date}\n` +
              `🕒 *Time :* ${result.time}\n\n` +
              `> *${BOT_NAME_FANCY}*`;

            // 🔍  Send file automatically (document type for .zip etc.)
            await socket.sendMessage(sender, {
              document: { url: downloadUrl },
              fileName: filename,
              mimetype: 'application/octet-stream',
              caption: caption
            }, { quoted: shonux });

          } catch (err) {
            console.error("Error in MediaFire downloader:", err);

            // ✅ In catch also send Meta mention style
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            let cfg = await loadUserConfigFromMongo(sanitized) || {};
            let botName = cfg.botName || ' ${botName}';

            const shonux = {
              key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_MEDIAFIRE"
              },
              message: {
                contactMessage: {
                  displayName: botName,
                  vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
              }
            };

            await socket.sendMessage(sender, { text: '*âŒ Internal Error. Please try again later.*' }, { quoted: shonux });
          }
          break;
        }

        // ðƒá´„á´› ð—–Ê€ɪᴍɪɴá´€ÊŸ ðŒð™³ ð—ªɪá´‹ɪá´˜á´˜ ð—–á´€êœ±á´‡

        case 'wikipp': {
          try {
            const q = args.join(' ');
            if (!q) {
              return socket.sendMessage(sender, {
                text: 'âŽ Please enter a pastpaper search term!\n\nExample: .wikipp o/l ict'
              }, { quoted: msg });
            }

            // quick reaction
            await socket.sendMessage(sender, { react: { text: '🔍 ', key: msg.key } });

            // Wiki search endpoint
            const searchApi = `https://pp-api-beta.vercel.app/api/wiki/pp?q=${encodeURIComponent(q)}`;
            const { data } = await axios.get(searchApi, { timeout: 15000 });

            if (!data?.results || data.results.length === 0) {
              return socket.sendMessage(sender, { text: 'âŽ No results found for that query!' }, { quoted: msg });
            }

            // filter noisy links
            const filtered = data.results.filter(r => {
              const t = (r.title || '').toLowerCase();
              if (!r.link) return false;
              if (t.includes('next page') || t.includes('contact') || t.includes('terms') || t.includes('privacy')) return false;
              return true;
            });

            if (filtered.length === 0) {
              return socket.sendMessage(sender, { text: '⚠️ No relevant pastpaper results found.' }, { quoted: msg });
            }

            const results = filtered.slice(0, 5);

            // build caption
            const caption = `*PAST PAPER RESULT*\n\n${results.map((r, i) => `*${i + 1}.* ${r.title}`).join('\n')}\n\n📢 *Preview:* ${results[0].preview}\n\n> *Reply with number to download*`;

            // send list (image if thumbnail available)
            let sentMsg;
            if (results[0].thumbnail) {
              sentMsg = await socket.sendMessage(sender, {
                image: { url: results[0].thumbnail },
                caption
              }, { quoted: msg });
            } else {
              sentMsg = await socket.sendMessage(sender, {
                text: caption
              }, { quoted: msg });
            }

            // listener for user's choice
            const listener = async (update) => {
              try {
                const m = update.messages[0];
                if (!m.message) return;

                const text = m.message.conversation || m.message.extendedTextMessage?.text;
                const isReply =
                  m.message.extendedTextMessage &&
                  m.message.extendedTextMessage.contextInfo?.stanzaId === sentMsg.key.id;

                if (isReply && ['1', '2', '3', '4', '5'].includes(text)) {
                  const index = parseInt(text, 10) - 1;
                  const selected = results[index];
                  if (!selected) return;

                  await socket.sendMessage(sender, { react: { text: '⏳', key: m.key } });

                  // call wiki download endpoint to get pdfs/images
                  try {
                    const dlApi = `https://pp-api-beta.vercel.app/api/wiki/ppdl?url=${encodeURIComponent(selected.link)}`;
                    const { data: dlData } = await axios.get(dlApi, { timeout: 20000 });

                    if (!dlData?.pdfs || dlData.pdfs.length === 0) {
                      await socket.sendMessage(sender, { react: { text: 'âŒ', key: m.key } });
                      await socket.sendMessage(sender, { text: 'âŽ No direct PDF found for that page.' }, { quoted: m });
                      socket.ev.off('messages.upsert', listener);
                      return;
                    }

                    const pdfs = dlData.pdfs;

                    if (pdfs.length === 1) {
                      // single pdf -> send directly
                      const pdfUrl = pdfs[0];
                      await socket.sendMessage(sender, { react: { text: 'â¬‡️', key: m.key } });

                      await socket.sendMessage(sender, {
                        document: { url: pdfUrl },
                        mimetype: 'application/pdf',
                        fileName: `${selected.title}.pdf`,
                        caption: `📑 ${selected.title}`
                      }, { quoted: m });

                      await socket.sendMessage(sender, { react: { text: '✅', key: m.key } });
                      socket.ev.off('messages.upsert', listener);
                    } else {
                      // multiple pdfs -> list them and wait for choice
                      let desc = `📑 *${selected.title}* â€” multiple PDFs found:\n\n`;
                      pdfs.forEach((p, i) => {
                        desc += `*${i + 1}.* ${p.split('/').pop() || `PDF ${i + 1}`}\n`;
                      });
                      desc += `\n💬 Reply with number (1-${pdfs.length}) to download that PDF.`;

                      const infoMsg = await socket.sendMessage(sender, { text: desc }, { quoted: m });

                      const dlListener = async (dlUpdate) => {
                        try {
                          const d = dlUpdate.messages[0];
                          if (!d.message) return;

                          const text2 = d.message.conversation || d.message.extendedTextMessage?.text;
                          const isReply2 =
                            d.message.extendedTextMessage &&
                            d.message.extendedTextMessage.contextInfo?.stanzaId === infoMsg.key.id;

                          if (isReply2) {
                            if (!/^\d+$/.test(text2)) return;
                            const dlIndex = parseInt(text2, 10) - 1;
                            if (dlIndex < 0 || dlIndex >= pdfs.length) {
                              return socket.sendMessage(sender, { text: 'âŽ Invalid option.' }, { quoted: d });
                            }

                            const finalPdf = pdfs[dlIndex];
                            await socket.sendMessage(sender, { react: { text: 'â¬‡️', key: d.key } });

                            try {
                              await socket.sendMessage(sender, {
                                document: { url: finalPdf },
                                mimetype: 'application/pdf',
                                fileName: `${selected.title} (${dlIndex + 1}).pdf`,
                                caption: `📑 ${selected.title} (${dlIndex + 1})`
                              }, { quoted: d });

                              await socket.sendMessage(sender, { react: { text: '✅', key: d.key } });
                            } catch (err) {
                              await socket.sendMessage(sender, { react: { text: 'âŒ', key: d.key } });
                              await socket.sendMessage(sender, { text: `âŒ Failed to send file. Direct link:\n${finalPdf}` }, { quoted: d });
                            }

                            socket.ev.off('messages.upsert', dlListener);
                            socket.ev.off('messages.upsert', listener);
                          }
                        } catch (err) {
                          // ignore
                        }
                      };

                      socket.ev.on('messages.upsert', dlListener);
                    }

                  } catch (err) {
                    await socket.sendMessage(sender, { react: { text: 'âŒ', key: m.key } });
                    await socket.sendMessage(sender, { text: `âŒ Error fetching PDFs: ${err.message}` }, { quoted: m });
                    socket.ev.off('messages.upsert', listener);
                  }
                }
              } catch (err) {
                // ignore per-message errors
              }
            };

            socket.ev.on('messages.upsert', listener);

          } catch (err) {
            await socket.sendMessage(sender, { react: { text: 'âŒ', key: msg.key } });
            await socket.sendMessage(sender, { text: `âŒ ERROR: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // // ðƒá´„á´› ð—–Ê€ɪᴍɪɴá´€ÊŸ ðŒð™³ ð—£á´€êœ±á´›á´˜á´€á´˜á´‡Ê€ ð—–á´€êœ±á´‡

        case 'pp': {
          try {
            const q = args.join(' ');
            if (!q) {
              return socket.sendMessage(sender, {
                text: 'âŽ Please enter a pastpaper search term!\n\nExample: .pp o/l ict'
              }, { quoted: msg });
            }

            // Short reaction to show we're working
            await socket.sendMessage(sender, { react: { text: '🔍 ', key: msg.key } });

            // Search API (you provided)
            const searchApi = `https://pp-api-beta.vercel.app/api/pastpapers?q=${encodeURIComponent(q)}`;
            const { data } = await axios.get(searchApi);

            if (!data?.results || data.results.length === 0) {
              return socket.sendMessage(sender, { text: 'âŽ No results found for that query!' }, { quoted: msg });
            }

            // Filter out generic pages like Next Page / Contact Us / Terms / Privacy
            const filtered = data.results.filter(r => {
              const t = (r.title || '').toLowerCase();
              if (!r.link) return false;
              if (t.includes('next page') || t.includes('contact us') || t.includes('terms') || t.includes('privacy policy')) return false;
              return true;
            });

            if (filtered.length === 0) {
              return socket.sendMessage(sender, { text: 'âŽ No relevant pastpaper results found.' }, { quoted: msg });
            }

            // Take top 5 results
            const results = filtered.slice(0, 5);

            // Build caption
            let caption = `📋š *Ê€á´‡êœ±á´œÊŸá´› ᴏêœ° á´˜á´€êœ±á´› á´˜á´€á´˜á´‡Ê€:* ${q}\n\n`;
            results.forEach((r, i) => {
              caption += `*${i + 1}. ${r.title}*\n🔗 ð—£Ê€á´‡ᴠɪá´‡ᴡ : ${r.link}\n\n`;
            });
            caption += `*💬 Ê€á´‡á´˜ÊŸʏ ᴡɪá´›Êœ ɴá´œᴍÊ™á´‡Ê€ (1-${results.length}) to download/view.*`;

            // Send first result image if any thumbnail, else just send text with first link preview
            let sentMsg;
            if (results[0].thumbnail) {
              sentMsg = await socket.sendMessage(sender, {
                image: { url: results[0].thumbnail },
                caption
              }, { quoted: msg });
            } else {
              sentMsg = await socket.sendMessage(sender, {
                text: caption
              }, { quoted: msg });
            }

            // Listener for user choosing an item (1..n)
            const listener = async (update) => {
              try {
                const m = update.messages[0];
                if (!m.message) return;

                const text = m.message.conversation || m.message.extendedTextMessage?.text;
                const isReply =
                  m.message.extendedTextMessage &&
                  m.message.extendedTextMessage.contextInfo?.stanzaId === sentMsg.key.id;

                if (isReply && ['1', '2', '3', '4', '5'].includes(text)) {
                  const index = parseInt(text, 10) - 1;
                  const selected = results[index];
                  if (!selected) return;

                  // show processing reaction
                  await socket.sendMessage(sender, { react: { text: '⏳', key: m.key } });

                  // Call download API to get direct pdf(s)
                  try {
                    const dlApi = `https://pp-api-beta.vercel.app/api/download?url=${encodeURIComponent(selected.link)}`;
                    const { data: dlData } = await axios.get(dlApi);

                    if (!dlData?.found || !dlData.pdfs || dlData.pdfs.length === 0) {
                      await socket.sendMessage(sender, { react: { text: 'âŒ', key: m.key } });
                      await socket.sendMessage(sender, { text: 'âŽ No direct PDF found for that page.' }, { quoted: m });
                      // cleanup
                      socket.ev.off('messages.upsert', listener);
                      return;
                    }

                    const pdfs = dlData.pdfs; // array of URLs

                    if (pdfs.length === 1) {
                      // single pdf -> send directly
                      const pdfUrl = pdfs[0];
                      await socket.sendMessage(sender, { react: { text: 'â¬‡️', key: m.key } });

                      await socket.sendMessage(sender, {
                        document: { url: pdfUrl },
                        mimetype: 'application/pdf',
                        fileName: `${selected.title}.pdf`,
                        caption: `📑 ${selected.title}`
                      }, { quoted: m });

                      await socket.sendMessage(sender, { react: { text: '✅', key: m.key } });

                      socket.ev.off('messages.upsert', listener);
                    } else {
                      // multiple pdfs -> list options and wait for choose
                      let desc = `📑 *${selected.title}* â€” multiple PDFs found:\n\n`;
                      pdfs.forEach((p, i) => {
                        desc += `*${i + 1}.* ${p.split('/').pop() || `PDF ${i + 1}`}\n`;
                      });
                      desc += `\n💬 Reply with number (1-${pdfs.length}) to download that PDF.`;

                      const infoMsg = await socket.sendMessage(sender, {
                        text: desc
                      }, { quoted: m });

                      // nested listener for pdf choice
                      const dlListener = async (dlUpdate) => {
                        try {
                          const d = dlUpdate.messages[0];
                          if (!d.message) return;

                          const text2 = d.message.conversation || d.message.extendedTextMessage?.text;
                          const isReply2 =
                            d.message.extendedTextMessage &&
                            d.message.extendedTextMessage.contextInfo?.stanzaId === infoMsg.key.id;

                          if (isReply2) {
                            if (!/^\d+$/.test(text2)) return;
                            const dlIndex = parseInt(text2, 10) - 1;
                            if (dlIndex < 0 || dlIndex >= pdfs.length) {
                              return socket.sendMessage(sender, { text: 'âŽ Invalid option.' }, { quoted: d });
                            }

                            const finalPdf = pdfs[dlIndex];
                            await socket.sendMessage(sender, { react: { text: 'â¬‡️', key: d.key } });

                            try {
                              await socket.sendMessage(sender, {
                                document: { url: finalPdf },
                                mimetype: 'application/pdf',
                                fileName: `${selected.title} (${dlIndex + 1}).pdf`,
                                caption: `📑 ${selected.title} (${dlIndex + 1})`
                              }, { quoted: d });

                              await socket.sendMessage(sender, { react: { text: '✅', key: d.key } });
                            } catch (err) {
                              await socket.sendMessage(sender, { react: { text: 'âŒ', key: d.key } });
                              await socket.sendMessage(sender, { text: `âŒ Download/send failed.\n\nDirect link:\n${finalPdf}` }, { quoted: d });
                            }

                            socket.ev.off('messages.upsert', dlListener);
                            socket.ev.off('messages.upsert', listener);
                          }
                        } catch (err) {
                          // ignore inner errors but log if you want
                        }
                      };

                      socket.ev.on('messages.upsert', dlListener);
                      // keep outer listener off until user chooses or we cleanup inside dlListener
                    }

                  } catch (err) {
                    await socket.sendMessage(sender, { react: { text: 'âŒ', key: m.key } });
                    await socket.sendMessage(sender, { text: `âŒ Error fetching PDF: ${err.message}` }, { quoted: m });
                    socket.ev.off('messages.upsert', listener);
                  }
                }
              } catch (err) {
                // ignore per-message listener errors
              }
            };

            socket.ev.on('messages.upsert', listener);

          } catch (err) {
            await socket.sendMessage(sender, { react: { text: 'âŒ', key: msg.key } });
            await socket.sendMessage(sender, { text: `âŒ ERROR: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ðƒá´„á´› ð—–Ê€ɪᴍɪɴá´€ÊŸ ðŒð™³ ð—¨Ê€ÊŸ ð—–á´€êœ±á´‡

        case 'tourl':
        case 'url':
        case 'upload': {






          const quoted = msg.message?.extendedTextMessage?.contextInfo;
          const mime = quoted?.quotedMessage?.imageMessage?.mimetype ||
            quoted?.quotedMessage?.videoMessage?.mimetype ||
            quoted?.quotedMessage?.audioMessage?.mimetype ||
            quoted?.quotedMessage?.documentMessage?.mimetype;

          if (!quoted || !mime) {
            return await socket.sendMessage(sender, { text: 'âŒ *Please reply to an image or video.*' });
          }

          // Fake Quote for Style
          const metaQuote = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_MEDIA" },
            message: { contactMessage: { displayName: "${BOT_NAME_FANCY}", vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:Upload Service\nORG:Catbox/ImgBB\nEND:VCARD` } }
          };

          let mediaType;
          let msgKey;

          if (quoted.quotedMessage.imageMessage) {
            mediaType = 'image';
            msgKey = quoted.quotedMessage.imageMessage;
          } else if (quoted.quotedMessage.videoMessage) {
            mediaType = 'video';
            msgKey = quoted.quotedMessage.videoMessage;
          } else if (quoted.quotedMessage.audioMessage) {
            mediaType = 'audio';
            msgKey = quoted.quotedMessage.audioMessage;
          } else if (quoted.quotedMessage.documentMessage) {
            mediaType = 'document';
            msgKey = quoted.quotedMessage.documentMessage;
          }

          try {
            // Using existing downloadContentFromMessage
            const stream = await downloadContentFromMessage(msgKey, mediaType);
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            const ext = mime.split('/')[1] || 'tmp';
            const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}.${ext}`);
            fs.writeFileSync(tempFilePath, buffer);

            const fileSize = (buffer.length / 1024 / 1024).toFixed(2) + ' MB';
            const typeStr = mediaType.charAt(0).toUpperCase() + mediaType.slice(1);

            let catboxUrl = '';
            let imgbbUrl = '';

            // Upload to Catbox
            try {
              const catboxForm = new FormData();
              catboxForm.append('fileToUpload', fs.createReadStream(tempFilePath));
              catboxForm.append('reqtype', 'fileupload');

              const catboxResponse = await axios.post('https://catbox.moe/user/api.php', catboxForm, {
                headers: catboxForm.getHeaders()
              });
              catboxUrl = catboxResponse.data.trim();
            } catch (catboxError) {
              console.error('Catbox upload error:', catboxError);
              catboxUrl = 'âŒ Upload failed';
            }

            // Upload to ImgBB (works best with images)
            try {
              const base64Data = buffer.toString('base64');
              const imgbbForm = new FormData();
              imgbbForm.append('key', 'e4b536bbf102cfccc5d8758489052547');
              imgbbForm.append('image', base64Data);

              const imgbbResponse = await axios.post('https://api.imgbb.com/1/upload', imgbbForm, {
                headers: imgbbForm.getHeaders()
              });

              if (imgbbResponse.data.success) {
                imgbbUrl = imgbbResponse.data.data.url;
              } else {
                imgbbUrl = 'âŒ Upload failed';
              }
            } catch (imgbbError) {
              console.error('ImgBB upload error:', imgbbError);
              imgbbUrl = 'âŒ Upload failed';
            }

            // Cleanup
            fs.unlinkSync(tempFilePath);

            // Prepare message
            const txt = `
☘️ *DCT CRIMINAL MD URL CONVERTER*

📂 *Type:* ${typeStr}
📋Š *Size:* ${fileSize}

📦 *Catbox URL:* ${catboxUrl}
🔍  *ImgBB URL:* ${imgbbUrl || 'N/A'}

> *${BOT_NAME_FANCY}*`;

            // Determine thumbnail for preview
            let thumbnailUrl = "https://cdn-icons-png.flaticon.com/512/337/337946.png";
            if (catboxUrl && !catboxUrl.includes('âŒ') && catboxUrl.match(/\.(jpeg|jpg|gif|png)$/i)) {
              thumbnailUrl = catboxUrl;
            } else if (imgbbUrl && !imgbbUrl.includes('âŒ')) {
              thumbnailUrl = imgbbUrl;
            }

            await socket.sendMessage(sender, {
              text: txt,
              contextInfo: {
                externalAdReply: {
                  title: "Media Uploaded Successfully!",
                  body: "Dual Upload Service",
                  thumbnailUrl: thumbnailUrl,
                  sourceUrl: catboxUrl && !catboxUrl.includes('âŒ') ? catboxUrl : (imgbbUrl && !imgbbUrl.includes('âŒ') ? imgbbUrl : ''),
                  mediaType: 1,
                  renderLargerThumbnail: true
                }
              }
            }, { quoted: metaQuote });

          } catch (e) {
            console.error(e);
            await socket.sendMessage(sender, { text: 'âŒ *Error uploading media.*' });
          }
        }
          break;

        // ðƒá´„á´› ð—–Ê€ɪᴍɪɴá´€ÊŸ ðŒð™³ ð—–ᴠɪá´…á´‡ᴏ ð—–á´€êœ±á´‡

        case 'cvideo': {
          try {


            // react
            try { await socket.sendMessage(sender, { react: { text: "🎬", key: msg.key } }); } catch (e) { }

            // args: <targetJid> <search keywords>
            const targetArg = args[0];
            const query = args.slice(1).join(" ").trim();

            if (!targetArg || !query) {
              return await socket.sendMessage(sender, {
                text: "*âŒ Format à·€ැරදà·’යà·’!* Use: `.cvideo <jid|number|channelId> <TikTok keyword>`"
              }, { quoted: msg });
            }

            // normalize target jid
            let targetJid = targetArg;
            if (!targetJid.includes('@')) {
              if (/^0029/.test(targetJid)) {
                targetJid = `${targetJid}@newsletter`;
              } else {
                targetJid = `${targetJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
              }
            }

            // TikTok search
            await socket.sendMessage(sender, { text: `🔍  TikTok à¶‘à¶šà·™නà·Š à·ƒà·™à·€à·“ම à·ƒà·’දà·” à·€à·™මà·’නà·Š... (${query})` }, { quoted: msg });

            const params = new URLSearchParams({ keywords: query, count: '5', cursor: '0', HD: '1' });
            const response = await axios.post("https://tikwm.com/api/feed/search", params, {
              headers: {
                'Content-Type': "application/x-www-form-urlencoded; charset=UTF-8",
                'Cookie': "current_language=en",
                'User-Agent': "Mozilla/5.0"
              }
            });

            const videos = response.data?.data?.videos;
            if (!videos || videos.length === 0) {
              return await socket.sendMessage(sender, { text: '⚠️ TikTok video à¶‘à¶šà¶šà·Š à·„මà·”නà·œà·€à·”ණා.' }, { quoted: msg });
            }

            // get first video
            const v = videos[0];
            const videoUrl = v.play || v.download;
            if (!videoUrl) {
              return await socket.sendMessage(sender, { text: 'âŒ Video à¶‘à¶š බාà¶œත à¶šà·… නà·œà·„ැà¶š.' }, { quoted: msg });
            }

            // resolve channel name
            let channelname = targetJid;
            try {
              if (typeof socket.newsletterMetadata === 'function') {
                const meta = await socket.newsletterMetadata("jid", targetJid);
                if (meta && meta.name) channelname = meta.name;
              }
            } catch (e) { }

            // format date
            const dateStr = v.create_time ? new Date(v.create_time * 1000).toLocaleDateString() : 'Unknown';

            // ✨ caption style
            const caption = `☘️ *Title :* ${v.title || 'Unknown'}

👀 ${v.play_count || 'N/A'} Views, ${v.duration || 'N/A'} sec, ${dateStr}
*00:00 ────────── ${v.duration || '00:00'}*
*ලස්සන රියැක්ට් කනී ...💖😽🐱*
> ${channelname}`;

            // send video (no ref / no meta / no bot name)
            await socket.sendMessage(targetJid, {
              video: { url: videoUrl },
              caption
            });

            // confirm to sender
            if (targetJid !== sender) {
              await socket.sendMessage(sender, {
                text: `✅ TikTok video à¶‘à¶š *${channelname}* à·€à·™ත à·ƒාරà·Šථà¶šà·€ යැà·€à·”ණා! 🎬ðŸ˜Ž`
              }, { quoted: msg });
            }

          } catch (err) {
            console.error('cvideo TT error:', err);
            await socket.sendMessage(sender, { text: `âŒ දෝà·‚යà¶šà·Š: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ðƒá´„á´› ð—–Ê€ɪᴍɪɴá´€ÊŸ ðŒð™³ ð—¦á´‡á´›ɴá´‡ᴡêœ± ð—–á´€êœ±á´‡

        case 'setnews': {
          try {

            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const chatId = sender; // chat/group/channel id
            const subcmdRaw = args[0] || '';
            const subcmd = subcmdRaw.toString().toLowerCase();

            // --- news sources (edit / extend as needed) ---
            const newsSources = {
              adanews: { key: 'adanews', name: 'Ada News', api: 'https://saviya-kolla-api.koyeb.app/news/ada' },
              sirasanews: { key: 'sirasanews', name: 'Sirasa News', api: 'https://saviya-kolla-api.koyeb.app/news/sirasa' },
              derananews: { key: 'derana', name: 'Derana News', api: 'https://tharuzz-news-api.vercel.app/api/news/derana' },
              hirunews: { key: 'hirunews', name: 'Hiru News', api: 'https://tharuzz-news-api.vercel.app/api/news/hiru' },
              lankadeepanews: { key: 'lankadeepanews', name: 'Lankadeepa', api: 'https://saviya-kolla-api.koyeb.app/news/lankadeepa' },
              gagananews: { key: 'gagananews', name: 'Gagana', api: 'https://saviya-kolla-api.koyeb.app/news/gagana' }
            };

            // --- small in-case helpers (fully local to this block) ---
            async function loadCfg() {
              const cfg = await loadUserConfigFromMongo(sanitized) || {};
              cfg.newsSubscriptions = cfg.newsSubscriptions || [];
              // sentNews stores history of sent items to prevent duplicates:
              // [{ chatId, source, id, hash, sentAt }]
              cfg.sentNews = cfg.sentNews || [];
              return cfg;
            }
            async function persistCfg(cfg) {
              cfg.newsSubscriptions = cfg.newsSubscriptions || [];
              cfg.sentNews = cfg.sentNews || [];
              await setUserConfigInMongo(sanitized, cfg);
            }

            // create stable uid for item
            function deriveUid(n) {
              if (!n) return null;
              if (n.url) return n.url;
              if (n.id) return String(n.id);
              if (n.title) return `${n.title}||${n.date || ''}||${n.time || ''}`;
              return null;
            }

            // create content hash to detect updates
            function contentHashFor(n) {
              const str = JSON.stringify({
                title: n.title || '',
                desc: n.desc || n.summary || '',
                image: n.image || '',
                date: n.date || '',
                time: n.time || ''
              });
              return crypto.createHash('sha256').update(str).digest('hex');
            }

            // Helper: check whether item already sent; returns object { found, updated }
            function checkSent(cfg, chatIdLocal, sourceKey, itemId) {
              if (!itemId) return { found: false, entry: null };
              const entry = (cfg.sentNews || []).find(e => e.chatId === chatIdLocal && e.source === sourceKey && e.id === itemId);
              return { found: Boolean(entry), entry: entry || null };
            }

            // record (or update) sent item (and trim history to limit)
            function recordSent(cfg, chatIdLocal, sourceKey, itemId, hash) {
              if (!itemId) return;
              cfg.sentNews = cfg.sentNews || [];
              const idx = cfg.sentNews.findIndex(e => e.chatId === chatIdLocal && e.source === sourceKey && e.id === itemId);
              const now = Date.now();
              if (idx >= 0) {
                cfg.sentNews[idx].hash = hash;
                cfg.sentNews[idx].sentAt = now;
              } else {
                cfg.sentNews.push({ chatId: chatIdLocal, source: sourceKey, id: itemId, hash, sentAt: now });
              }
              // keep history bounded
              const MAX_HISTORY = 1000;
              if (cfg.sentNews.length > MAX_HISTORY) {
                cfg.sentNews = cfg.sentNews.slice(cfg.sentNews.length - MAX_HISTORY);
              }
            }

            // --- Add/Remove/List subscriptions (same as before) ---
            async function addNewsSubscription(chatIdLocal, sourceKey, intervalMinutes = 15) {
              if (!newsSources[sourceKey]) throw new Error('Unknown source: ' + sourceKey);
              const cfg = await loadCfg();
              const existsIdx = cfg.newsSubscriptions.findIndex(s => s.chatId === chatIdLocal && s.source === sourceKey);
              const now = Date.now();
              // immediate first-run so user sees news quickly
              const sub = { chatId: chatIdLocal, source: sourceKey, intervalMinutes, nextRun: now, enabled: true };
              if (existsIdx >= 0) {
                cfg.newsSubscriptions[existsIdx] = { ...cfg.newsSubscriptions[existsIdx], ...sub };
              } else {
                cfg.newsSubscriptions.push(sub);
              }
              await persistCfg(cfg);
              return cfg.newsSubscriptions;
            }

            async function removeNewsSubscription(chatIdLocal, sourceKey = null) {
              const cfg = await loadCfg();
              if (!sourceKey) cfg.newsSubscriptions = cfg.newsSubscriptions.filter(s => s.chatId !== chatIdLocal);
              else cfg.newsSubscriptions = cfg.newsSubscriptions.filter(s => !(s.chatId === chatIdLocal && s.source === sourceKey));
              await persistCfg(cfg);
              return cfg.newsSubscriptions;
            }

            async function listNewsSubscriptionsForChat(chatIdLocal) {
              const cfg = await loadCfg();
              return cfg.newsSubscriptions.filter(s => s.chatId === chatIdLocal);
            }

            // --- dispatcher (one-per-session) inside this block but global-tracked to avoid duplicates ---
            if (!global.__sessionNewsDispatchers) global.__sessionNewsDispatchers = {}; // global map

            function ensureDispatcherRunning() {
              if (global.__sessionNewsDispatchers[sanitized]) return; // already running for this session
              // start interval
              const iv = setInterval(async () => {
                try {
                  const cfg = await loadCfg();
                  const subs = cfg.newsSubscriptions || [];
                  const now = Date.now();

                  for (let i = 0; i < subs.length; i++) {
                    const sub = subs[i];
                    if (!sub.enabled) continue;
                    if (!sub.nextRun || sub.nextRun <= now) {
                      const src = newsSources[sub.source];
                      if (!src) {
                        console.warn('Unknown source in subscription, skipping:', sub.source);
                        sub.nextRun = Date.now() + (sub.intervalMinutes || 15) * 60000;
                        continue;
                      }

                      try {
                        const res = await axios.get(src.api, { timeout: 10000 });
                        if (!res.data || !res.data.status || !res.data.result) {
                          console.warn('No valid data from news API for', sub.source);
                          sub.nextRun = Date.now() + (sub.intervalMinutes || 15) * 60000;
                          continue;
                        }

                        const results = Array.isArray(res.data.result) ? res.data.result : [res.data.result];

                        // For each candidate news item, check dedupe then send if new or updated
                        for (let ri = 0; ri < results.length; ri++) {
                          const n = results[ri];
                          const uid = deriveUid(n);
                          if (!uid) continue;

                          // reload fresh cfg to check latest sentNews (avoid race)
                          const freshCfg = await loadCfg();
                          const existing = checkSent(freshCfg, sub.chatId, sub.source, uid);
                          const newHash = contentHashFor(n);

                          if (!existing.found) {
                            // NEW item -> send normally
                            const caption = `📰 *${n.title || 'No title'}*\n\n📅${n.date || ''} ${n.time || ''}\n\n${n.desc || ''}\n\n🔗 ${n.url || ''}\n\n_Provided by ${freshCfg.botName || (typeof BOT_NAME_FANCY !== 'undefined' ? BOT_NAME_FANCY : 'Bot')}_`;
                            try {
                              if (n.image) {
                                await socket.sendMessage(sub.chatId, { image: { url: n.image }, caption });
                              } else {
                                await socket.sendMessage(sub.chatId, { text: caption });
                              }
                              // record as sent (persist)
                              recordSent(freshCfg, sub.chatId, sub.source, uid, newHash);
                              await persistCfg(freshCfg);
                            } catch (sendErr) {
                              console.error('Failed to send news message to', sub.chatId, sendErr);
                            }
                          } else {
                            // Already sent before: check if hash changed (i.e., updated content)
                            const prevHash = existing.entry.hash || null;
                            if (prevHash && prevHash !== newHash) {
                              // content updated -> send UPDATE message
                              const caption = `ðŸ”„ *UPDATE* â€” ${n.title || 'No title'}\n\n📅${n.date || ''} ${n.time || ''}\n\n${n.desc || ''}\n\n🔗 ${n.url || ''}\n\n_Provided by ${freshCfg.botName || (typeof BOT_NAME_FANCY !== 'undefined' ? BOT_NAME_FANCY : 'Bot')}_`;
                              try {
                                if (n.image) {
                                  await socket.sendMessage(sub.chatId, { image: { url: n.image }, caption });
                                } else {
                                  await socket.sendMessage(sub.chatId, { text: caption });
                                }
                                // update recorded hash & sentAt
                                recordSent(freshCfg, sub.chatId, sub.source, uid, newHash);
                                await persistCfg(freshCfg);
                              } catch (sendErr) {
                                console.error('Failed to send UPDATE message to', sub.chatId, sendErr);
                              }
                            } else {
                              // same item, not updated -> skip
                              // console.log('Skipping already-sent news for', sub.chatId, sub.source, uid);
                              continue;
                            }
                          }
                        }

                        // schedule next run (after processing all items)
                        sub.nextRun = Date.now() + (sub.intervalMinutes || 15) * 60000;
                      } catch (fetchErr) {
                        console.error('Error fetching news for', sub.source, fetchErr);
                        sub.nextRun = Date.now() + (sub.intervalMinutes || 15) * 60000;
                      }
                    }
                  }
                  // persist any nextRun updates
                  cfg.newsSubscriptions = subs;
                  await persistCfg(cfg);

                  // if no subscriptions left for this session, stop dispatcher to save resources
                  const remaining = (await loadCfg()).newsSubscriptions || [];
                  if (!remaining.length) {
                    clearInterval(iv);
                    delete global.__sessionNewsDispatchers[sanitized];
                  }
                } catch (topErr) {
                  console.error('News dispatcher top-level error:', topErr);
                }
              }, 60 * 1000); // checks every 60s

              global.__sessionNewsDispatchers[sanitized] = { intervalId: iv, startedAt: Date.now() };
            }

            // --- command handling inside single case ---
            if (!subcmd) {
              const keys = Object.keys(newsSources).join(', ');
              return await socket.sendMessage(chatId, { text: `â— Usage:\nâ€¢ .setnews <sourceKey> [intervalMinutes]\nâ€¢ .setnews del [sourceKey]\nâ€¢ .setnews list\nâ€¢ .setnews [minutes]  -> enable ALL sources (e.g. .setnews 15)\n\nAvailable sources: ${keys}` });
            }

            // list
            if (subcmd === 'list') {
              const subs = await listNewsSubscriptionsForChat(chatId);
              if (!subs.length) {
                return await socket.sendMessage(chatId, { text: 'ℹ️ No auto-news subscriptions for this chat.' });
              }
              let txt = '*Auto-news subscriptions for this chat:*\n\n';
              subs.forEach(s => {
                txt += `â€¢ ${s.source} (${newsSources[s.source]?.name || 'Unknown'}) â€” every ${s.intervalMinutes} min â€” ${s.enabled ? 'enabled' : 'disabled'}\n`;
              });
              return await socket.sendMessage(chatId, { text: txt });
            }

            // delete/remove
            if (subcmd === 'del' || subcmd === 'remove' || subcmd === 'off') {
              const targetSource = args[1] ? args[1].toString().toLowerCase() : null;
              await removeNewsSubscription(chatId, targetSource);
              const cfgAfter = await loadCfg();
              if (!cfgAfter.newsSubscriptions.length && global.__sessionNewsDispatchers[sanitized]) {
                clearInterval(global.__sessionNewsDispatchers[sanitized].intervalId);
                delete global.__sessionNewsDispatchers[sanitized];
              }
              if (targetSource) {
                return await socket.sendMessage(chatId, { text: `✅ Removed news source *${targetSource}* from this chat.` });
              } else {
                return await socket.sendMessage(chatId, { text: `✅ Removed all auto-news subscriptions from this chat.` });
              }
            }

            // if the first arg is purely numeric -> treat as interval and enable ALL sources
            if (/^\d+$/.test(subcmd)) {
              const intervalMins = parseInt(subcmd, 10);
              if (isNaN(intervalMins) || intervalMins < 1) {
                return await socket.sendMessage(chatId, { text: 'â— Invalid interval. Provide minutes as a number (>=1).' });
              }

              const keys = Object.keys(newsSources);
              for (let k = 0; k < keys.length; k++) {
                const key = keys[k];
                try {
                  await addNewsSubscription(chatId, key, intervalMins);
                } catch (err) {
                  console.warn('Failed to add subscription for', key, err);
                }
              }

              // ensure dispatcher is running for this session
              ensureDispatcherRunning();

              return await socket.sendMessage(chatId, { text: `✅ Auto-news enabled for *all sources* (${keys.join(', ')}) every *${intervalMins}* minutes.` });
            }

            // otherwise treat subcmd as a sourceKey to add
            const sourceKey = subcmd;
            const intervalArg = args[1];
            const intervalMins = intervalArg ? parseInt(intervalArg, 10) : 15;
            if (!newsSources[sourceKey]) {
              const keys = Object.keys(newsSources).join(', ');
              return await socket.sendMessage(chatId, { text: `â— Unknown source. Available sources: ${keys}\nExample: .setnews adanews 30` });
            }
            if (isNaN(intervalMins) || intervalMins < 1) {
              return await socket.sendMessage(chatId, { text: 'â— Invalid interval. Provide minutes as a number (>=1).' });
            }

            // add subscription and ensure dispatcher
            await addNewsSubscription(chatId, sourceKey, intervalMins);
            ensureDispatcherRunning();

            return await socket.sendMessage(chatId, { text: `✅ Auto-news enabled for *${newsSources[sourceKey].name}* in this chat every *${intervalMins}* minutes.` });
          } catch (e) {
            console.error('setnews (single-block) error:', e);
            try {
              await socket.sendMessage(sender, { text: `âŒ Failed to process .setnews: ${e.message || e}` });
            } catch (ignore) { }
          }
          break;
        }

        // ðƒá´„á´› ð—–Ê€ɪᴍɪɴá´€ÊŸ ðŒð™³ ð—šá´Šɪá´… ð—–á´€êœ±á´‡

        case 'gjid':
        case 'groupjid':
        case 'grouplist': {
          try {
            // ✅ Owner check removed â€” now everyone can use it!

            await socket.sendMessage(sender, {
              react: { text: "📋", key: msg.key }
            });

            await socket.sendMessage(sender, {
              text: "📋 Fetching group list..."
            }, { quoted: msg });

            const groups = await socket.groupFetchAllParticipating();
            const groupArray = Object.values(groups);

            // Sort by creation time (oldest to newest)
            groupArray.sort((a, b) => a.creation - b.creation);

            if (groupArray.length === 0) {
              return await socket.sendMessage(sender, {
                text: "âŒ No groups found!"
              }, { quoted: msg });
            }

            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const cfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = cfg.botName || BOT_NAME_FANCY || "CHMA MD";

            // ✅ Pagination setup â€” 10 groups per message
            const groupsPerPage = 10;
            const totalPages = Math.ceil(groupArray.length / groupsPerPage);

            for (let page = 0; page < totalPages; page++) {
              const start = page * groupsPerPage;
              const end = start + groupsPerPage;
              const pageGroups = groupArray.slice(start, end);

              // ✅ Build message for this page
              const groupList = pageGroups.map((group, index) => {
                const globalIndex = start + index + 1;
                const memberCount = group.participants ? group.participants.length : 'N/A';
                const subject = group.subject || 'Unnamed Group';
                const jid = group.id;
                return `*${globalIndex}. ${subject}*\n*👥 Members:* ${memberCount}\n🆔 ${jid}`;
              }).join('\n\n');

              const textMsg = `📋  *GROUP LIST - ${botName}*\n\n*📑 Page:* ${page + 1}/${totalPages}\n*👥 Total Groups:* ${groupArray.length}\n\n${groupList}`;

              await socket.sendMessage(sender, {
                text: textMsg,
                footer: `ðŸ¤– Powered by ${botName}`
              });

              // Add short delay to avoid spam
              if (page < totalPages - 1) {
                await delay(1000);
              }
            }

          } catch (err) {
            console.error('GJID command error:', err);
            await socket.sendMessage(sender, {
              text: "❌ Failed to fetch group list. Please try again later."
            }, { quoted: msg });
          }
          break;
        }

        case 'cid': {
          // Extract query from message
          const q = msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption || '';

          // ✅ Dynamic botName load
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          let cfg = await loadUserConfigFromMongo(sanitized) || {};
          let botName = cfg.botName || BOT_NAME_FANCY;

          // ✅ Fake Meta AI vCard (for quoted msg)
          const shonux = {
            key: {
              remoteJid: "status@broadcast",
              participant: "0@s.whatsapp.net",
              fromMe: false,
              id: "META_AI_FAKE_ID_CID"
            },
            message: {
              contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
              }
            }
          };

          // Clean command prefix (.cid, /cid, !cid, etc.)
          const channelLink = q.replace(/^[.\/!]cid\s*/i, '').trim();

          // Check if link is provided
          if (!channelLink) {
            return await socket.sendMessage(sender, {
              text: '⚠️ Please provide a WhatsApp Channel link.\n\n📌 *Example:* .cid https://whatsapp.com/channel/123456789'
            }, { quoted: shonux });
          }

          // Validate link
          const match = channelLink.match(/whatsapp\.com\/channel\/([\w-]+)/);
          if (!match) {
            return await socket.sendMessage(sender, {
              text: '⚠️  *Invalid channel link format.*\n\nMake sure it looks like:\nhttps://whatsapp.com/channel/xxxxxxxxx'
            }, { quoted: shonux });
          }

          const inviteId = match[1];

          try {
            // Send fetching message
            await socket.sendMessage(sender, {
              text: `🔍  Fetching channel info for: *${inviteId}*`
            }, { quoted: shonux });

            // Get channel metadata
            const metadata = await socket.newsletterMetadata("invite", inviteId);

            if (!metadata || !metadata.id) {
              return await socket.sendMessage(sender, {
                text: '❌ Channel not found or inaccessible.'
              }, { quoted: shonux });
            }

            // Format details
            const infoText = `
📋¡ *WHATSAPP CHANNEL INFO*

🆔 *Id:* ${metadata.id}
📌 *Name:* ${metadata.name}
👥 *Followers:* ${metadata.subscribers?.toLocaleString() || 'N/A'}
📅*Created On:* ${metadata.creation_time ? new Date(metadata.creation_time * 1000).toLocaleString("si-LK") : 'Unknown'}

> *${botName}*
`;

            // Send preview if available
            if (metadata.preview) {
              await socket.sendMessage(sender, {
                image: { url: `https://pps.whatsapp.net${metadata.preview}` },
                caption: infoText
              }, { quoted: shonux });
            } else {
              await socket.sendMessage(sender, {
                text: infoText
              }, { quoted: shonux });
            }

          } catch (err) {
            console.error("CID command error:", err);
            await socket.sendMessage(sender, {
              text: '⚠️  An unexpected error occurred while fetching channel info.'
            }, { quoted: shonux });
          }

          break;
        }

        case 'jid': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const cfg = await loadUserConfigFromMongo(sanitized) || {};
          const botName = cfg.botName || BOT_NAME_FANCY; // dynamic bot name

          const userNumber = sender.split('@')[0];

          // Reaction
          await socket.sendMessage(sender, {
            react: { text: "🆔", key: msg.key }
          });

          // Fake contact quoting for meta style
          const shonux = {
            key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID" },
            message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nEND:VCARD` } }
          };

          await socket.sendMessage(sender, {
            text: `*Chat Jid:* ${sender}\n*Your Number:* +${userNumber}`,
          }, { quoted: shonux });
          break;
        }



        case 'setlogo': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const senderNum = (nowsender || '').split('@')[0];
          const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
          if (senderNum !== sanitized && senderNum !== ownerNum) {
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO1" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: 'âŒ Permission denied. Only the session owner or bot owner can change this session logo.' }, { quoted: shonux });
            break;
          }

          const ctxInfo = (msg.message.extendedTextMessage || {}).contextInfo || {};
          const quotedMsg = ctxInfo.quotedMessage;
          const media = await downloadQuotedMedia(quotedMsg).catch(() => null);
          let logoSetTo = null;

          try {
            if (media && media.buffer) {
              const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
              fs.ensureDirSync(sessionPath);
              const mimeExt = (media.mime && media.mime.split('/').pop()) || 'jpg';
              const logoPath = path.join(sessionPath, `logo.${mimeExt}`);
              fs.writeFileSync(logoPath, media.buffer);
              let cfg = await loadUserConfigFromMongo(sanitized) || {};
              cfg.logo = logoPath;
              await setUserConfigInMongo(sanitized, cfg);
              logoSetTo = logoPath;
            } else if (args && args[0] && (args[0].startsWith('http') || args[0].startsWith('https'))) {
              let cfg = await loadUserConfigFromMongo(sanitized) || {};
              cfg.logo = args[0];
              await setUserConfigInMongo(sanitized, cfg);
              logoSetTo = args[0];
            } else {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: 'â— Usage: Reply to an image with `.setlogo` OR provide an image URL: `.setlogo https://example.com/logo.jpg`' }, { quoted: shonux });
              break;
            }

            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO3" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            await socket.sendMessage(sender, { text: `✅ Logo set for this session: ${logoSetTo}` }, { quoted: shonux });
          } catch (e) {
            console.error('setlogo error', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETLOGO4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: `âŒ Failed to set logo: ${e.message || e}` }, { quoted: shonux });
          }
          break;
        }

        case 'setbotname': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const senderNum = (nowsender || '').split('@')[0];
          const ownerNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
          if (senderNum !== sanitized && senderNum !== ownerNum) {
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME1" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: 'âŒ Permission denied. Only the session owner or bot owner can change this session bot name.' }, { quoted: shonux });
            break;
          }

          const name = args.join(' ').trim();
          if (!name) {
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME2" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            return await socket.sendMessage(sender, { text: `â— Provide bot name. Example: .setbotname ${BOT_NAME_FANCY}- 01` }, { quoted: shonux });
          }

          try {
            let cfg = await loadUserConfigFromMongo(sanitized) || {};
            cfg.botName = name;
            await setUserConfigInMongo(sanitized, cfg);

            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME3" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };

            await socket.sendMessage(sender, { text: `✅ Bot display name set for this session: ${name}` }, { quoted: shonux });
          } catch (e) {
            console.error('setbotname error', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: `âŒ Failed to set bot name: ${e.message || e}` }, { quoted: shonux });
          }
          break;
        }



        case 'block': {
          try {

            const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
            const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            const sessionOwner = (number || '').replace(/[^0-9]/g, '');


            if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
              try { await socket.sendMessage(sender, { react: { text: "âŒ", key: msg.key } }); } catch (e) { }
              await socket.sendMessage(sender, { text: 'âŒ à¶”බට මà·™ය භාà·€à·’ත à¶šà·’රà·“මට à¶…à·€à·ƒර නැත. (Owner à·„ෝ මà·™à·„à·’ session owner à·€à·’ය යà·”තà·”යà·’)' }, { quoted: msg });
              break;
            }


            let targetJid = null;
            const ctx = msg.message?.extendedTextMessage?.contextInfo;

            if (ctx?.participant) targetJid = ctx.participant; // replied user
            else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0]; // mentioned
            else if (args && args.length > 0) {
              const possible = args[0].trim();
              if (possible.includes('@')) targetJid = possible;
              else {
                const digits = possible.replace(/[^0-9]/g, '');
                if (digits) targetJid = `${digits}@s.whatsapp.net`;
              }
            }

            if (!targetJid) {
              try { await socket.sendMessage(sender, { react: { text: "âŒ", key: msg.key } }); } catch (e) { }
              await socket.sendMessage(sender, { text: 'â— à¶šරà·”ණාà¶šර reply à¶šරන à·„ෝ mention à¶šරන à·„ෝ number à¶‘à¶š යà·œදනà·Šන. à¶‹දාà·„රණය: .block 9477xxxxxxx' }, { quoted: msg });
              break;
            }

            // normalize
            if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
            if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

            // perform block
            try {
              if (typeof socket.updateBlockStatus === 'function') {
                await socket.updateBlockStatus(targetJid, 'block');
              } else {
                // some bailey builds use same method name; try anyway
                await socket.updateBlockStatus(targetJid, 'block');
              }
              try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch (e) { }
              await socket.sendMessage(sender, { text: `✅ @${targetJid.split('@')[0]} blocked successfully.`, mentions: [targetJid] }, { quoted: msg });
            } catch (err) {
              console.error('Block error:', err);
              try { await socket.sendMessage(sender, { react: { text: "âŒ", key: msg.key } }); } catch (e) { }
              await socket.sendMessage(sender, { text: 'âŒ Failed to block the user. (Maybe invalid JID or API failure)' }, { quoted: msg });
            }

          } catch (err) {
            console.error('block command general error:', err);
            try { await socket.sendMessage(sender, { react: { text: "âŒ", key: msg.key } }); } catch (e) { }
            await socket.sendMessage(sender, { text: 'âŒ Error occurred while processing block command.' }, { quoted: msg });
          }
          break;
        }

        case 'unblock': {
          try {
            // caller number (who sent the command)
            const callerNumberClean = (senderNumber || '').replace(/[^0-9]/g, '');
            const ownerNumberClean = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
            const sessionOwner = (number || '').replace(/[^0-9]/g, '');

            // allow if caller is global owner OR this session's owner
            if (callerNumberClean !== ownerNumberClean && callerNumberClean !== sessionOwner) {
              try { await socket.sendMessage(sender, { react: { text: "âŒ", key: msg.key } }); } catch (e) { }
              await socket.sendMessage(sender, { text: 'âŒ à¶”බට මà·™ය භාà·€à·’ත à¶šà·’රà·“මට à¶…à·€à·ƒර නැත. (Owner à·„ෝ මà·™à·„à·’ session owner à·€à·’ය යà·”තà·”යà·’)' }, { quoted: msg });
              break;
            }

            // determine target JID: reply / mention / arg
            let targetJid = null;
            const ctx = msg.message?.extendedTextMessage?.contextInfo;

            if (ctx?.participant) targetJid = ctx.participant;
            else if (ctx?.mentionedJid && ctx.mentionedJid.length) targetJid = ctx.mentionedJid[0];
            else if (args && args.length > 0) {
              const possible = args[0].trim();
              if (possible.includes('@')) targetJid = possible;
              else {
                const digits = possible.replace(/[^0-9]/g, '');
                if (digits) targetJid = `${digits}@s.whatsapp.net`;
              }
            }

            if (!targetJid) {
              try { await socket.sendMessage(sender, { react: { text: "âŒ", key: msg.key } }); } catch (e) { }
              await socket.sendMessage(sender, { text: 'â— à¶šරà·”ණාà¶šර reply à¶šරන à·„ෝ mention à¶šරන à·„ෝ number à¶‘à¶š යà·œදනà·Šන. à¶‹දාà·„රණය: .unblock 9477xxxxxxx' }, { quoted: msg });
              break;
            }

            // normalize
            if (!targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;
            if (!targetJid.endsWith('@s.whatsapp.net') && !targetJid.includes('@')) targetJid = `${targetJid}@s.whatsapp.net`;

            // perform unblock
            try {
              if (typeof socket.updateBlockStatus === 'function') {
                await socket.updateBlockStatus(targetJid, 'unblock');
              } else {
                await socket.updateBlockStatus(targetJid, 'unblock');
              }
              try { await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } }); } catch (e) { }
              await socket.sendMessage(sender, { text: `🔍  @${targetJid.split('@')[0]} unblocked successfully.`, mentions: [targetJid] }, { quoted: msg });
            } catch (err) {
              console.error('Unblock error:', err);
              try { await socket.sendMessage(sender, { react: { text: "âŒ", key: msg.key } }); } catch (e) { }
              await socket.sendMessage(sender, { text: 'âŒ Failed to unblock the user.' }, { quoted: msg });
            }

          } catch (err) {
            console.error('unblock command general error:', err);
            try { await socket.sendMessage(sender, { react: { text: "âŒ", key: msg.key } }); } catch (e) { }
            await socket.sendMessage(sender, { text: 'âŒ Error occurred while processing unblock command.' }, { quoted: msg });
          }
          break;
        }

        // default
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('âŒ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch (e) { }
    }

  });
}

// ---------------- Call Rejection Handler ----------------

// ---------------- Simple Call Rejection Handler ----------------

async function setupCallRejection(socket, sessionNumber) {
  socket.ev.on('call', async (calls) => {
    try {
      // Load user-specific config from MongoDB
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      if (userConfig.ANTI_CALL !== 'on') return;

      console.log(`📋 Incoming call detected for ${sanitized} - Auto rejecting...`);

      for (const call of calls) {
        if (call.status !== 'offer') continue;

        const id = call.id;
        const from = call.from;

        // Reject the call
        await socket.rejectCall(id, from);

        // Send rejection message to caller
        await socket.sendMessage(from, {
          text: '*📵 Auto call rejection is enabled. Calls are automatically rejected.*'
        });

        console.log(`✅ Auto-rejected call from ${from}`);

        // Send notification to bot user
        const userJid = jidNormalizedUser(socket.user.id);
        const rejectionMessage = formatMessage(
          '📋 CALL REJECTED',
          `Auto call rejection is active.\n\nCall from: ${from}\nTime: ${getSriLankaTimestamp()}`,
          BOT_NAME_FANCY
        );

        await socket.sendMessage(userJid, {
          image: { url: config.RCD_IMAGE_PATH },
          caption: rejectionMessage
        });
      }
    } catch (err) {
      console.error(`Call rejection error for ${sessionNumber}:`, err);
    }
  });
}

// ---------------- Auto Message Read Handler ----------------

async function setupAutoMessageRead(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    // Quick return if no need to process
    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

    if (autoReadSetting === 'off') return;

    const from = msg.key.remoteJid;

    // Simple message body extraction
    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (type === 'ephemeralMessage')
        ? msg.message.ephemeralMessage.message
        : msg.message;

      if (type === 'conversation') {
        body = actualMsg.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = actualMsg.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage') {
        body = actualMsg.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = actualMsg.videoMessage?.caption || '';
      }
    } catch (e) {
      // If we can't extract body, treat as non-command
      body = '';
    }

    // Check if it's a command message
    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);

    // Apply auto read rules - SINGLE ATTEMPT ONLY
    if (autoReadSetting === 'all') {
      // Read all messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    } else if (autoReadSetting === 'cmd' && isCmd) {
      // Read only command messages - one attempt only
      try {
        await socket.readMessages([msg.key]);
        console.log(`✅ Command message read: ${msg.key.id}`);
      } catch (error) {
        console.warn('Failed to read command message (single attempt):', error?.message);
        // Don't retry - just continue
      }
    }
  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    try {
      // Load user-specific config from MongoDB
      let autoTyping = config.AUTO_TYPING; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config

      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};

        // Check for auto typing in user config
        if (userConfig.AUTO_TYPING !== undefined) {
          autoTyping = userConfig.AUTO_TYPING;
        }

        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto typing setting (from user config or global)
      if (autoTyping === 'true') {
        try {
          await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
          // Stop typing after 3 seconds
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) { }
          }, 3000);
        } catch (e) {
          console.error('Auto typing error:', e);
        }
      }

      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        try {
          await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
          // Stop recording after 3 seconds  
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) { }
          }, 3000);
        } catch (e) {
          console.error('Auto recording error:', e);
        }
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}


// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch (e) { }
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch (e) { }
    try { await removeNumberFromMongo(sanitized); } catch (e) { }
    try {
      const ownerNumbers = ['94787940686', '94779357798'];
      const caption = formatMessage('*OWNER NOTICE — SESSION REMOVED*', `*Number:* ${sanitized}\n*Session Removed Due To Logout.*\n\n*Active Sessions Now:* ${activeSockets.size}`, BOT_NAME_FANCY);
      for (const ownerNum of ownerNumbers) {
        const ownerJid = `${ownerNum}@s.whatsapp.net`;
        if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.RCD_IMAGE_PATH }, caption });
      }
    } catch (e) { }
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
        || lastDisconnect?.error?.statusCode
        || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
        || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
        || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
        || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch (e) { console.error(e); }
      } else {
        console.log(`Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { await delay(10000); activeSockets.delete(number.replace(/[^0-9]/g, '')); socketCreationTime.delete(number.replace(/[^0-9]/g, '')); const mockRes = { headersSent: false, send: () => { }, status: () => mockRes }; await EmpirePair(number, mockRes); } catch (e) { console.error('Reconnect attempt failed', e); }
      }

    }

  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(() => { });

  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: 'silent' });

  try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      // 🛠️ FIX: Browsers.macOS fixed for Linux/Render
      browser: ["Ubuntu", "Chrome", "20.0.04"] 
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    handleMessageRevocation(socket, sanitizedNumber);
    setupAutoMessageRead(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);


    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    // Save creds to Mongo when updated
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();

        const credsPath = path.join(sessionPath, 'creds.json');

        if (!fs.existsSync(credsPath)) return;
        const fileStats = fs.statSync(credsPath);
        if (fileStats.size === 0) return;

        const fileContent = await fs.readFile(credsPath, 'utf8');
        const trimmedContent = fileContent.trim();
        if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') return;

        let credsObj;
        try { credsObj = JSON.parse(trimmedContent); } catch (e) { return; }

        if (!credsObj || typeof credsObj !== 'object') return;

        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
        console.log('✅ Creds saved to MongoDB successfully');

      } catch (err) {
        console.error('Failed saving creds on creds.update:', err);
      }
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(() => ({ status: 'failed', error: 'joinGroup not configured' }));

          try {
            const autoFollowNewsletters = ['120363421785026867@newsletter', '120363423916773660@newsletter'];
            for (const jid of autoFollowNewsletters) {
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch (e) { }
            }
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              if (!autoFollowNewsletters.includes(jid)) {
                try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch (e) { }
              }
            }
          } catch (e) { }

          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.RCD_IMAGE_PATH;

          const initialCaption = formatMessage(useBotName,
            `*SUCCESSFULLY CONNECTED*\n\n*NUMBER :* ${sanitizedNumber}\n*CONNECTING :* Wait few seconds`,
            useBotName
          );

          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.RCD_IMAGE_PATH }, caption: initialCaption });
              }
            }
          } catch (e) {
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch (e) { }
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
            `*SUCCESSFULLY CONNECTED*\n\n*NUMBER :* ${sanitizedNumber}\n*STATUS :* ${groupStatus}\n*CONNECT TIME:* ${getSriLankaTimestamp()}`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try { await socket.sendMessage(userJid, { delete: sentMsg.key }); } catch (delErr) { }
            }
            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) { }

          await sendAdminConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await sendOwnerConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await addNumberToMongo(sanitizedNumber);

        } catch (e) {
          console.error('Connection open error:', e);
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'CHATUWA-MINI-main'}`); } catch (e) { }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch (e) { }
      }
    });

    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: 'HOW ARE YOU MY BUDDY', activesession: activeSockets.size });
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => { }, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.RCD_IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(() => { }); } catch (e) { }
      try { running.ws?.close(); } catch (e) { }
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch (e) { }
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) { }
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch (e) { }
  });
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'CHATUWA-MINI-main'}`); } catch (e) { console.error('Failed to restart pm2:', e); }
});


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async () => { try { const nums = await getAllNumbersFromMongo(); if (nums && nums.length) { for (const n of nums) { if (!activeSockets.has(n)) { const mockRes = { headersSent: false, send: () => { }, status: () => mockRes }; await EmpirePair(n, mockRes); await delay(500); } } } } catch (e) { } })();

module.exports = router;
