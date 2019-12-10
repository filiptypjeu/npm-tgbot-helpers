import { LocalStorage } from 'node-localstorage';
import TelegramBot, { ParseMode, Message } from 'node-telegram-bot-api';

export interface IBotHelperInit {
  telegramBotToken: string;
  localStoragePath: string;
  globalVariables?: string[];
  userVariables?: string[];
  commands?: IBotHelperCommand[];
}

export interface IBotHelperProps {
  telegramBot: TelegramBot;
  localStorage: LocalStorage;
  globalVariables: string[];
  userVariables: string[];
  commands: IBotHelperCommand[];
}

export interface IBotHelperCommand {
  command: string;
  regexp?: RegExp;
  groupVariable?: string;
  type?: string;
  description?: string;
  callback: (msg: Message) => void;
}

let bot: TelegramBot;
let ls: LocalStorage;

let commands: IBotHelperCommand[] = [];
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

  commands = initWith.commands ? initWith.commands : [];

  commands.forEach(c => {
    if (!c.regexp) {
      c.regexp = new RegExp(`/${c.command}\\b`);
    }
    bot.onText(c.regexp, msg => {
      console.log(`Command /${c.command} called by user ${msg.from!.id}.`);
      if (c.groupVariable && !isInList(msg.chat.id, c.groupVariable)) {
        console.log(`Callback NOT called.`);
        return;
      }
      console.log(`Callback called.`);
      return c.callback(msg);
    });
  });

  if (initWith.globalVariables) {
    initWith.globalVariables.forEach(s => gVars.push(s));
  }
  gVars = gVars.sort();

  if (initWith.userVariables) {
    initWith.userVariables.forEach(s => uVars.push(s));
  }
  uVars = uVars.sort();

  console.log(
    `Telegram bot initialized with ${gVars.length} global variables, ${uVars.length} user variables and ${commands.length} commands.`,
  );

  return bot;
};

export const properties = (): IBotHelperProps => {
  const p: IBotHelperProps = {
    globalVariables: gVars,
    localStorage: ls,
    telegramBot: bot,
    userVariables: uVars,
    commands: commands,
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
