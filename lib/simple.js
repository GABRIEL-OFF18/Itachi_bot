import path from 'path'
import chalk from 'chalk'
import fetch from 'node-fetch'
import fs from 'fs'
import { fileTypeFromBuffer } from 'file-type'
import { format } from 'util'
import { fileURLToPath } from 'url'
import * as baileys from "@whiskeysockets/baileys"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const parseMention = (text = '') => {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
}

const {
    default: _makeWaSocket,
    makeWALegacySocket,
    proto,
    jidDecode,
    generateWAMessageFromContent
} = baileys

export function protoType() {
    Object.defineProperties(proto.WebMessageInfo.prototype, {
        serialize: {
            value() {
                return Object.defineProperties(this, {
                    conn: {
                        value: this.conn || global.conn,
                        enumerable: false,
                        writable: true
                    }
                })
            },
            enumerable: false
        }
    })
    console.log(chalk.greenBright("✅ protoType cargado"))
    return proto
}

export function makeWASocket(connectionOptions, options = {}) {
    const conn = (global.opts?.["legacy"] ? makeWALegacySocket : _makeWaSocket)(connectionOptions)

    const sock = Object.defineProperties(conn, {

        chats: {
            value: { ...(options.chats || {}) },
            writable: true,
        },

        decodeJid: {
            value(jid) {
                if (!jid || typeof jid !== "string") return jid
                if (/:\d+@/gi.test(jid)) {
                    const decode = jidDecode(jid) || {}
                    return decode.user && decode.server ? `${decode.user}@${decode.server}` : jid
                }
                return jid
            },
        },

        parseMention: {
            value: parseMention
        },

        logger: {
            get() {
                return {
                    info(...args) { console.log(chalk.green("[INFO]"), format(...args)) },
                    error(...args) { console.log(chalk.red("[ERROR]"), format(...args)) },
                    warn(...args) { console.log(chalk.yellow("[WARN]"), format(...args)) },
                    debug(...args) { console.log(chalk.blue("[DEBUG]"), format(...args)) },
                }
            }
        },

        getFile: {
            async value(PATH, saveToFile = false) {
                let res, filename
                const data = Buffer.isBuffer(PATH) ? PATH :
                    /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], "base64") :
                    /^https?:\/\//.test(PATH) ? await (res = await fetch(PATH)).buffer() :
                    fs.existsSync(PATH) ? ((filename = PATH), fs.readFileSync(PATH)) :
                    Buffer.alloc(0)

                const type = await fileTypeFromBuffer(data) || { mime: "application/octet-stream", ext: ".bin" }

                if (saveToFile && !filename) {
                    filename = path.join(__dirname, "../tmp/" + Date.now() + "." + type.ext)
                    await fs.promises.writeFile(filename, data)
                }

                return {
                    res,
                    filename,
                    ...type,
                    data,
                    deleteFile() {
                        return filename && fs.promises.unlink(filename)
                    }
                }
            }
        },

        sendText: {
            value(jid, text, quoted, options = {}) {
                return conn.sendMessage(jid, { text, ...options }, { quoted })
            }
        },

        sendImage: {
            async value(jid, path, caption = '', quoted, options = {}) {
                let buffer = await conn.getFile(path)
                return conn.sendMessage(jid, { image: buffer.data, caption, ...options }, { quoted })
            }
        },

        sendVideo: {
            async value(jid, path, caption = '', quoted, options = {}) {
                let buffer = await conn.getFile(path)
                return conn.sendMessage(jid, { video: buffer.data, caption, ...options }, { quoted })
            }
        },

        sendAudio: {
            async value(jid, path, quoted, ptt = false, options = {}) {
                let buffer = await conn.getFile(path)
                return conn.sendMessage(jid, { audio: buffer.data, ptt, ...options }, { quoted })
            }
        },

        sendFile: {
            async value(jid, path, filename = '', caption = '', quoted, options = {}) {
                let buffer = await conn.getFile(path)
                return conn.sendMessage(jid, {
                    document: buffer.data,
                    fileName: filename || buffer.filename,
                    mimetype: buffer.mime,
                    caption,
                    ...options
                }, { quoted })
            }
        },

        sendContact: {
            async value(jid, numbers = [], quoted, options = {}) {
                let contacts = []
                for (let number of numbers) {
                    number = number.replace(/\D/g, '')
                    contacts.push({
                        displayName: number,
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${number}\nTEL;type=CELL;type=VOICE;waid=${number}:${number}\nEND:VCARD`
                    })
                }
                return conn.sendMessage(jid, { contacts: { displayName: `${contacts.length} Contactos`, contacts }, ...options }, { quoted })
            }
        },

        sendButtonText: {
            async value(jid, buttons = [], text, footer, quoted, options = {}) {
                return conn.sendMessage(jid, {
                    text,
                    footer,
                    buttons,
                    headerType: 1,
                    ...options
                }, { quoted })
            }
        },

        sendList: {
            async value(jid, text, footer, title, buttonText, sections, quoted, options = {}) {
                return conn.sendMessage(jid, {
                    text,
                    footer,
                    title,
                    buttonText,
                    sections,
                    ...options
                }, { quoted })
            }
        },

        sendSylph: {
            async value(jid, text = '', buffer, title, body, url, quoted) {
                let type
                if (buffer) {
                    try {
                        type = await conn.getFile(buffer)
                        buffer = type.data
                    } catch { }
                }
                const prep = generateWAMessageFromContent(jid, {
                    extendedTextMessage: {
                        text,
                        contextInfo: {
                            externalAdReply: { title, body, thumbnail: buffer, sourceUrl: url },
                            mentionedJid: parseMention(text)
                        }
                    }
                }, { quoted })
                return conn.relayMessage(jid, prep.message, { messageId: prep.key.id })
            }
        }

    })

    return sock
}

export function smsg(conn, m, store) {
    if (!m) return m

    if (m.key) {
        m.id = m.key.id
        m.chat = m.key.remoteJid
        m.fromMe = m.key.fromMe
        m.isGroup = m.chat.endsWith('@g.us')

        m.sender = conn.decodeJid(
            m.fromMe && conn.user.id ||
            m.participant ||
            m.key.participant ||
            m.chat
        )
    }

    if (m.message) {
        m.mtype = Object.keys(m.message)[0]
        m.msg = m.message[m.mtype]

        if (m.mtype === 'ephemeralMessage') {
            return smsg(conn, m.msg, store)
        }
    }

    m.reply = (text, chatId = m.chat, options = {}) => {
        return conn.sendMessage(chatId, { text, ...options }, { quoted: m })
    }

    return m
}