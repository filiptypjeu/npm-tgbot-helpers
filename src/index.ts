import { LocalStorage } from 'node-localstorage';
import TelegramBot, { ParseMode } from 'node-telegram-bot-api';

export interface IBotHelperInit {
  telegramBotToken: string;
  localStoragePath: string;
  globalVariables?: string[];
  userVariables?: string[];
}

export interface IBotHelperProps {
  telegramBot: TelegramBot;
  localStorage: LocalStorage;
  globalVariables: string[];
  userVariables: string[];
}

let bot: TelegramBot;
let ls: LocalStorage;

// let gods: number[] = [];
// let admins: number[] = [];

let uVars: string[] = [];
let gVars: string[] = ['adminsSendErrors'];

const adminListVariable = 'TGHELPERS#ADMINUSERIDS';

const stringListFromVariable = (variableName: string): string[] => {
  const s = variable(variableName);
  return s ? s.trim().split('\n') : [];
};

export const initBot = (initWith: IBotHelperInit): TelegramBot => {
  bot = new TelegramBot(initWith.telegramBotToken, { polling: true });
  ls = new LocalStorage(initWith.localStoragePath);

  // admins = numberListFromVariable(adminListVariable);
  // gods = numberListFromVariable(godListVariable);

  if (initWith.globalVariables) {
    initWith.globalVariables.forEach(s => gVars.push(s));
  }
  gVars = gVars.sort();
  uVars = (initWith.userVariables ? initWith.userVariables : []).sort();

  return bot;
};

export const properties = (): IBotHelperProps => {
  const p: IBotHelperProps = {
    globalVariables: gVars,
    localStorage: ls,
    telegramBot: bot,
    userVariables: uVars,
  };
  return p;
};

export const globalVariables = (): string[] => {
  return gVars;
};

export const isInList = (userId: number | string, variableName: string) => {
  return stringListFromVariable(variableName).includes(userId.toString());
};

export const isAdmin = (userId: number) => {
  return isInList(userId, adminListVariable);
};

export const sendTo = async (userId: number | string, text: string, parseMode?: ParseMode) => {
  bot.sendMessage(userId, text, { parse_mode: parseMode }).catch(e => {
    if (e.code === 'ETELEGRAM') {
      sendError(
        `Error code: ${e.code}, msg_length: ${text.length}, ok: ${e.response.body.ok}, error_code: ${e.response.body.error_code}, description: ${e.response.body.description}`,
      );
    } else {
      console.log(e.code);
      console.log(e.response.body);
    }
  });
};

export const sendToList = async (variableName: string, text: string, parseMode?: ParseMode) => {
  return Promise.all(stringListFromVariable(variableName).map(id => sendTo(id, text, parseMode)));
};

export const sendToAdmins = async (text: string, parseMode?: ParseMode) => {
  return sendToList(adminListVariable, text, parseMode);
};

export const sendError = async (e: any) => {
  console.error(e);
  if (variableIsTrue('godsSendErrors')) {
    sendToAdmins(e.toString() ? e.toString().slice(0, 3000) : 'Error...');
  }
};

export const variable = (variableName: string, value?: string | number) => {
  if (value === undefined) {
    const s = ls.getItem(variableName);
    return s ? s : '';
  }
  return ls.setItem(variableName, value.toString());
};

export const variableNumber = (variableName: string, defaultValue: number = 0): number => {
  const s = ls.getItem(variableName);
  return Number(s) ? Number(s) : defaultValue;
};

export const variableIsTrue = (variableName: string): boolean => {
  return ls.getItem(variableName) === '1';
};

export const userIdsToInfo = async (variableName: string, extraInfo?: string[]) => {
  const userIds = stringListFromVariable(variableName);

  if (userIds.length > 0) {
    return await Promise.all(
      userIds.map(async (n, i) => {
        return await bot.getChat(n).then(chat => {
          return `${chat.first_name} ${chat.last_name}, ${chat.username} (ID: ${n}${
            extraInfo ? `, ${extraInfo[i] ? extraInfo[i] : 'no info'}` : ''
          })`;
        });
      }),
    );
  } else {
    return [];
  }
};

export const toggleUserIdInList = (userId: number | string, variableName: string) => {
  const userIds = stringListFromVariable(variableName);

  if (userIds.includes(userId.toString())) {
    variable(variableName, userIds.filter(id => id !== userId.toString()).join('\n'));
    return false;
  }

  userIds.push(userId.toString());
  variable(variableName, userIds.join('\n'));
  return true;
};

export const toggleAdmin = (userId: number) => {
  return toggleUserIdInList(userId, adminListVariable);
};
