import TelegramBot = require("node-telegram-bot-api");
import { LocalStorage } from "node-localstorage";
import { properties, initTGHelpers } from "../index";

test('start', () => {
  expect(properties()).toEqual({
    telegramBotInstance: undefined,
    localStorageInstance: undefined,
    globalVariables: ["godsSendErrors"],
    userVariables: [],
  });
});

test('init', () => {
  const bot = new TelegramBot("");
  const ls = new LocalStorage("");

  initTGHelpers({
    telegramBotInstance: bot,
    localStorageInstance: ls,
    globalVariables: ["testVariable"],
    userVariables: ["var1", "var2"],
  });

  expect(properties()).toEqual({
    telegramBotInstance: bot,
    localStorageInstance: ls,
    globalVariables: ["godsSendErrors", "testVariable"],
    userVariables: ["var1", "var2"],
  });
});
