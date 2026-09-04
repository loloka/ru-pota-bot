import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { WELCOME_PINNED_POST } from '../src/bot/texts/welcomePost.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const token = process.env.BOT_TOKEN;
const rawInput = process.argv[2];

let targetChatId = null;
let targetMsgId = 474;

if (rawInput) {
  if (rawInput.includes('t.me/c/')) {
    const parts = rawInput.split('t.me/c/')[1].split('/');
    targetChatId = '-100' + parts[0];
    if (parts[1]) targetMsgId = parseInt(parts[1], 10);
  } else if (/^[0-9-]+$/.test(rawInput)) {
    targetChatId = rawInput;
    if (!targetChatId.startsWith('-100') && !targetChatId.startsWith('@')) {
      targetChatId = '-100' + targetChatId.replace(/^-/, '');
    }
  }
}

if (process.argv[3]) {
  targetMsgId = parseInt(process.argv[3], 10);
}

const chatCandidates = [
  targetChatId,
  process.env.MAIN_CHAT_ID,
  '-1004485477242',
  '-100' + String(process.env.MAIN_CHAT_ID || '').replace(/^-100/, '').replace(/^-/, ''),
].filter(Boolean);

async function editMessage() {
  if (!token) {
    console.error('❌ BOT_TOKEN не найден в .env');
    process.exit(1);
  }

  const url = `https://api.telegram.org/bot${token}/editMessageText`;

  for (const chatId of chatCandidates) {
    console.log(`📡 Попытка обновления в чате ${chatId} (сообщение #${targetMsgId})...`);
    try {
      const res = await axios.post(url, {
        chat_id: chatId,
        message_id: targetMsgId,
        text: WELCOME_PINNED_POST,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      if (res.data.ok) {
        console.log(`\x1b[32m✅ Закрепленное сообщение #${targetMsgId} успешно обновлено в чате ${chatId}!\x1b[0m`);
        return;
      }
    } catch (err) {
      if (err.response) {
        console.log(`  -> ${chatId}: ${err.response.data.description}`);
      } else {
        console.log(`  -> ${chatId}: ${err.message}`);
      }
    }
  }

  console.log('⚠️ Если бот сообщает "chat not found", убедитесь, что бот состоит в этом чате и имеет права администратора.');
}

editMessage();
