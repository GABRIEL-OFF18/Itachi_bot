process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1'
import './config.js'

const sessions = process.env.SESSIONS_PATH || './sessions'
const jadi = process.env.JADI_NAME || 'sessions'

global.botNumber = process.env.BOT_NUMBER || ''
global.isagiJadibts = process.env.ISAGI_JADIBTS === 'true' || false
global.ch = {}

import cfonts from 'cfonts'
import { createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'
import * as ws from 'ws'
import fs, { readdirSync, statSync, unlinkSync, existsSync, mkdirSync, readFileSync, rmSync, watch } from 'fs'
import yargs from 'yargs'
import { spawn, execSync } from 'child_process'
import os from 'os'
import cp from 'child_process'
import lodash from 'lodash'
import chalk from 'chalk'
import syntaxerror from 'syntax-error'
import pino from 'pino'
import Pino from 'pino'
import path, { join, dirname } from 'path'
import { Boom } from '@hapi/boom'
import { makeWASocket, protoType, serialize } from './lib/simple.js'
import { Low, JSONFile } from 'lowdb'
import store from './lib/store.js'
const { proto } = (await import('@whiskeysockets/baileys')).default
import pkg from 'google-libphonenumber'
const { PhoneNumberUtil } = pkg
const phoneUtil = PhoneNumberUtil.getInstance()
const { DisconnectReason, useMultiFileAuthState, MessageRetryMap, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, delay } = await import('@whiskeysockets/baileys')
import readline from 'readline'
import NodeCache from 'node-cache'

const { CONNECTING } = ws
const { chain } = lodash
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000

let { say } = cfonts
console.log(chalk.magentaBright('\n⚽ Iniciando...'))
say('Isago Bot', { font: 'simple', align: 'left', gradient: ['green', 'white'] })
say('Made Dev-gabrie-cell', { font: 'console', align: 'center', colors: ['cyan', 'magenta', 'yellow'] })

protoType()
global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
return rmPrefix ? /file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL : pathToFileURL(pathURL).toString()
}
global.__dirname = function dirname(pathURL) {
return path.dirname(global.__filename(pathURL, true))
}
global.__require = function require(dir = import.meta.url) {
return createRequire(dir)
}

global.timestamp = { start: new Date }
const __dirname = global.__dirname(import.meta.url)
global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.prefix = new RegExp('^[#!./-]')

global.db = new Low(new JSONFile('database.json'))
global.DATABASE = global.db

global.loadDatabase = async function loadDatabase() {
if (global.db.READ) {
return new Promise((resolve) => setInterval(async function() {
if (!global.db.READ) {
clearInterval(this)
resolve(global.db.data == null ? global.loadDatabase() : global.db.data)
}}, 1000))
}
if (global.db.data !== null) return
global.db.READ = true
await global.db.read().catch(console.error)
global.db.READ = null
global.db.data = {
users: {},
chats: {},
settings: {},
...(global.db.data || {})
}
global.db.chain = chain(global.db.data)
}

await loadDatabase()
const { state, saveCreds } = await useMultiFileAuthState(sessions)

const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 })
const userDevicesCache = new NodeCache({ stdTTL: 0, checkperiod: 0 })
const { version } = await fetchLatestBaileysVersion()

let phoneNumber = global.botNumber
const methodCodeQR = process.argv.includes("qr")
const methodCode = !!phoneNumber || process.argv.includes("code")
const MethodMobile = process.argv.includes("mobile")

const colors = chalk.bold.white
const qrOption = chalk.blueBright
const textOption = chalk.cyan

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (texto) => new Promise((resolver) => rl.question(texto, resolver))

let opcion

if (methodCodeQR) opcion = '1'

if (!methodCodeQR && !methodCode && !fs.existsSync(`./${sessions}/creds.json`)) {
do {
opcion = await question(colors("Seleccione una opción:\n") + qrOption("1. Con código QR\n") + textOption("2. Con código de texto\n--> "))
} while (!/^[1-2]$/.test(opcion))
}

if (opcion == '2') {
phoneNumber = await question(colors('Ingresa tu número (ejem: 573244278232):\n--> '))
phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
}

const connectionOptions = {
logger: pino({ level: 'silent' }),
printQRInTerminal: opcion == '1',
mobile: MethodMobile,
browser: ["MacOs", "Safari"],
auth: {
creds: state.creds,
keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" }))
},
markOnlineOnConnect: false,
generateHighQualityLinkPreview: true,
syncFullHistory: false,
getMessage: async (key) => {
try {
let jid = jidNormalizedUser(key.remoteJid)
let msg = await store.loadMessage(jid, key.id)
return msg?.message || ""
} catch {
return ""
}},
msgRetryCounterCache,
userDevicesCache,
cachedGroupMetadata: (jid) => global.conn?.chats?.[jid] ?? {},
version,
keepAliveIntervalMs: 55000,
maxIdleTimeMs: 60000
}

global.conn = makeWASocket(connectionOptions)
conn.ev.on("creds.update", saveCreds)

if (opcion == '2' && !conn.authState.creds.registered) {
setTimeout(async () => {
let pairCode = await conn.requestPairingCode(phoneNumber)
pairCode = pairCode?.match(/.{1,4}/g)?.join('-') || pairCode
console.log(chalk.cyan(`Tu código de vinculación: ${chalk.bold(pairCode)}`))
}, 500)
}

async function connectionUpdate(update) {
const { connection, lastDisconnect, isNewLogin } = update
if (isNewLogin) conn.isInit = true
const code = lastDisconnect?.error?.output?.statusCode
if (connection === "open") {
console.log(chalk.green("Conectado"))
}
if (connection === "close") {
if (code !== DisconnectReason.loggedOut) {
await global.reloadHandler(true)
}
}}

process.on('uncaughtException', console.error)
let handler = await import('./handler.js')

global.reloadHandler = async function(restatConn) {
const Handler = await import(`./handler.js?update=${Date.now()}`).catch(console.error)
if (Object.keys(Handler || {}).length) handler = Handler

if (restatConn) {
    try { global.conn.ws.close() } catch {}
    conn.ev.removeAllListeners()
    global.conn = makeWASocket(connectionOptions)
    conn = global.conn
}

conn.handler = handler.handler.bind(global.conn)
conn.connectionUpdate = connectionUpdate.bind(global.conn)
conn.credsUpdate = saveCreds.bind(global.conn, true)

conn.ev.on('messages.upsert', conn.handler)
conn.ev.on('connection.update', conn.connectionUpdate)
conn.ev.on('creds.update', conn.credsUpdate)

return true
}

await global.reloadHandler()
const pluginFolder = global.__dirname(join(__dirname, './plugins'))
const pluginFilter = (filename) => /\.js$/.test(filename)
global.plugins = {}

async function filesInit() {
for (const filename of readdirSync(pluginFolder).filter(pluginFilter)) {
try {
const file = global.__filename(join(pluginFolder, filename))
const module = await import(file)
global.plugins[filename] = module.default || module
} catch {
delete global.plugins[filename]
}}
}
filesInit()

global.reload = async (_ev, filename) => {
if (pluginFilter(filename)) {
const dir = global.__filename(join(pluginFolder, filename), true)
const err = syntaxerror(readFileSync(dir), filename, {
sourceType: 'module',
allowAwaitOutsideFunction: true
})
if (!err) {
const module = await import(`${global.__filename(dir)}?update=${Date.now()}`)
global.plugins[filename] = module.default || module
}}
}

Object.freeze(global.reload)
watch(pluginFolder, global.reload)

setInterval(async () => {
const tmpDir = join(__dirname, 'tmp')
try {
const files = readdirSync(tmpDir)
files.forEach(file => unlinkSync(join(tmpDir, file)))
} catch {}
}, 30000)

conn.ev.on('connection.update', connectionUpdate)