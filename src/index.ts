import TelegramBot, { ParseMode } from "node-telegram-bot-api";
import { LocalStorage } from "node-localstorage";

export interface ITGHelperProperties {
  telegramBotInstance: TelegramBot,
  localStorageInstance: LocalStorage,
  globalVariables?: string[],
  userVariables?: string[],
}

let bot: TelegramBot;
let ls: LocalStorage;

let gods: number[] = [];
let admins: number[] = [];

let uVars: string[] = [];
let gVars: string[] = [
  "godsSendErrors",
];

const adminList = "TGHELPERS#ADMINUSERIDS";
const godList = "TGHELPERS#GODUSERIDS";


const numberListFromVariable = (variableName: string): number[] => {
  let s = varGet(variableName);
  return (s ? s.trim().split("\n") : []).map(s => Number(s)).filter(n => n !== NaN);
}

export const initTGHelpers = (initWith: ITGHelperProperties) => {
  bot = initWith.telegramBotInstance;
  ls = initWith.localStorageInstance;

  admins = numberListFromVariable(adminList);
  gods = numberListFromVariable(godList);

  if (initWith.globalVariables) {
    initWith.globalVariables.forEach(s => gVars.push(s));
  }
  gVars = gVars.sort();
  uVars = (initWith.userVariables ? initWith.userVariables : []).sort();
}

export const properties = (): ITGHelperProperties => {
  const p: ITGHelperProperties = {
    telegramBotInstance: bot,
    localStorageInstance: ls,
    globalVariables: gVars,
    userVariables: uVars,
  }
  return p;
}

export const hasRights = (userId: number) => {
  return gods.includes(userId) ? true : admins.includes(userId);
}

export const sendTo = async (chatId: number, text: string, parseMode?: ParseMode) => {
  bot.sendMessage(chatId, text, { parse_mode: parseMode })
    .catch(e => {
      if (e.code === "ETELEGRAM") {
        sendError(`Error code: ${e.code}, msg_length: ${text.length}, ok: ${e.response.body.ok}, error_code: ${e.response.body.error_code}, description: ${e.response.body.description}`);
      } else {
        console.log(e.code);
        console.log(e.response.body);
      }
    });
}

export const sendToGods = async (text: string, parseMode?: ParseMode) => {
  gods.forEach(id => sendTo(id, text, parseMode));
}

export const sendToAdmins = async (text: string, parseMode?: ParseMode) => {
  admins.forEach(id => sendTo(id, text, parseMode));
}

export const sendError = async (e: any) => {
  console.error(e);
  if (varIsTrue("godsSendErrors")) {
    sendToGods(e.toString() ? e.toString().slice(0, 3000) : "Error...");
  }
}

export const varIsTrue = (variable: string): boolean => {
  return ls.getItem(variable) === "1";
}

export const varGet = (variable: string): string | null => {
  return ls.getItem(variable);
}

export const varGetNumber = (variable: string, defaultValue: number = 0): number => {
  const s = varGet(variable);
  return Number(s) ? Number(s) : defaultValue;
}

export const varSet = (variable: string, value: string | number) => {
  return ls.setItem(variable, value.toString());
}

export const userIdsToInfo = async (userIds: number[], extraInfo?: string[]) => {
  if (userIds.length > 0) {
    return await Promise.all(userIds.map(async (n, i) => {
      return await bot.getChat(n)
        .then(chat => {
          return `${chat.first_name} ${chat.last_name}, ${chat.username} (ID: ${n}${extraInfo ? `, ${extraInfo[i] ? extraInfo[i] : "no info"}` : ""})`;
        });
      }));
  } else {
    return [];
  } 
}

export const toggleUserIdInList = (userId: number, variable: string) => {
  const userIds = numberListFromVariable(variable);

  if (userIds.includes(userId)) {
    varSet(variable, userIds.filter(c => c !== userId).join("/n"));
    return false;
  }

  userIds.push(userId);
  varSet(variable, userIds.join("/n"));
  return true
}

export const toggleAdmin = (userId: number) => {
  return toggleUserIdInList(userId, adminList);
}