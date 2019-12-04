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

// let gods: number[] = [];
// let admins: number[] = [];

let uVars: string[] = [];
let gVars: string[] = [
  "godsSendErrors",
];

const adminListVariable = "TGHELPERS#ADMINUSERIDS";
const godListVariable = "TGHELPERS#GODUSERIDS";

const numberListFromVariable = (variableName: string): number[] => {
  return stringListFromVariable(variableName).map(s => Number(s)).filter(n => n !== NaN);
}

const stringListFromVariable = (variableName: string): string[] => {
  const s = variable(variableName);
  return (s ? s.trim().split("\n") : []);
}

export const initTGHelpers = (initWith: ITGHelperProperties) => {
  bot = initWith.telegramBotInstance;
  ls = initWith.localStorageInstance;

  // admins = numberListFromVariable(adminListVariable);
  // gods = numberListFromVariable(godListVariable);

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
  return stringListFromVariable(adminListVariable).includes(userId.toString()) ? true : stringListFromVariable(godListVariable).includes(userId.toString());
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
  return Promise.all(numberListFromVariable(godListVariable).map(id => sendTo(id, text, parseMode)));
}

export const sendToAdmins = async (text: string, parseMode?: ParseMode) => {
  return Promise.all(numberListFromVariable(adminListVariable).map(id => sendTo(id, text, parseMode)));
}

export const sendError = async (e: any) => {
  console.error(e);
  if (variableIsTrue("godsSendErrors")) {
    sendToGods(e.toString() ? e.toString().slice(0, 3000) : "Error...");
  }
}



export const variable = (variableName: string, value?: string | number) => {
  if (value === undefined) {
    const s = ls.getItem(variableName);
    return s ? s : "";
  }
  return ls.setItem(variableName, value.toString());
}

export const variableNumber = (variableName: string, defaultValue: number = 0): number => {
  const s = ls.getItem(variableName);
  return Number(s) ? Number(s) : defaultValue;
}

export const variableIsTrue = (variableName: string): boolean => {
  return ls.getItem(variableName) === "1";
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

export const toggleUserIdInList = (userId: number, variableName: string) => {
  const userIds = stringListFromVariable(variableName);

  if (userIds.includes(userId.toString())) {
    variable(variableName, userIds.filter(id => id !== userId.toString()).join("\n"));
    return false;
  }

  userIds.push(userId.toString());
  variable(variableName, userIds.join("\n"));
  return true
}

export const toggleAdmin = (userId: number) => {
  return toggleUserIdInList(userId, adminListVariable);
}

export const toggleGod = (userId: number) => {
  return toggleUserIdInList(userId, godListVariable);
}