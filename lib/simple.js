import path from 'path'
import { toAudio } from './converter.js'
import chalk from 'chalk'
import fetch from 'node-fetch'
import PhoneNumber from 'awesome-phonenumber'
import fs from 'fs'
import { fileTypeFromBuffer } from 'file-type'
import { format } from 'util'
import { fileURLToPath } from 'url'
import store from './store.js'
import * as baileys from "@whiskeysockets/baileys"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nullish = (args) => !(args !== null && args !== undefined)

const parseMention = (text = '') => {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
}

const {
    default: _makeWaSocket,
    makeWALegacySocket,
    proto,
    downloadContentFromMessage,
    jidDecode,
    areJidsSameUser,
    generateWAMessage,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    WAMessageStubType,
    extractMessageContent,
    makeInMemoryStore,
    getAggregateVotesInPollMessage,
    prepareWAMessageMedia,
    WA_DEFAULT_EPHEMERAL,
    PHONENUMBER_MCC,
    delay
} = baileys

export function protoType() {
    Object.defineProperties(proto.WebMessageInfo.prototype, {
        serialize: {
            value() {
                return Object.defineProperties(this || {}, {
                    conn: {
                        value: this?.conn || global?.conn || null,
                        enumerable: false,
                        writable: true
                    }
                })
            },
            enumerable: false
        }
    })
    console.log(chalk.greenBright("✅ protoType cargado correctamente"))
    return proto
}

export function serialize(obj = {}) {
    if (!obj) obj = {}
    return Object.defineProperties(obj, {
        conn: {
            value: obj?.conn || global?.conn || null,
            enumerable: false,
            writable: true
        }
    })
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
                    return decode.user && decode.server ? `(${decode.user}@${decode.server})` : jid
                }
                return jid
            },
        },

        getName: {
            value(jid, withoutContact = false) {
                jid = conn.decodeJid(jid)
                if (!jid) return ''
                let v
                if (jid.endsWith('@g.us')) {
                    v = conn.chats[jid]
                    if (v) return v.name || v.subject || ''
                    return ''
                } else {
                    v = conn.chats[jid]
                    return (withoutContact ? '' : v?.name) || v?.verifiedName || v?.notify || ('+' + jid.replace('@s.whatsapp.net', '')) || ''
                }
            },
            enumerable: true
        },

        parseMention: {
            value: parseMention
        },

        pushMessage: {
            async value(messages = []) {
                for (const msg of messages) {
                    if (!msg) continue
                    const jid = msg.key?.remoteJid
                    if (jid) {
                        try {
                            await store.bind(conn.ev)
                        } catch {}
                    }
                }
            },
            enumerable: true
        },

        logger: {
            get() {
                return {
                    info(...args) { console.log(chalk.bold.bgRgb(51, 204, 51)("INFO "), `[${chalk.rgb(255,255,255)(new Date().toUTCString())}]:`, chalk.cyan(format(...args))) },
                    error(...args) { console.log(chalk.bold.bgRgb(247, 38, 33)("ERROR "), `[${chalk.rgb(255,255,255)(new Date().toUTCString())}]:`, chalk.rgb(255,38,0)(format(...args))) },
                    warn(...args) { console.log(chalk.bold.bgRgb(255, 153, 0)("WARNING "), `[${chalk.rgb(255,255,255)(new Date().toUTCString())}]:`, chalk.redBright(format(...args))) },
                    trace(...args) { console.log(chalk.grey("TRACE "), `[${chalk.rgb(255,255,255)(new Date().toUTCString())}]:`, chalk.white(format(...args))) },
                    debug(...args) { console.log(chalk.bold.bgRgb(66, 167, 245)("DEBUG "), `[${chalk.rgb(255,255,255)(new Date().toUTCString())}]:`, chalk.white(format(...args))) },
                }
            },
            enumerable: true,
        },

        sendSylph: {
            async value(jid, text = '', buffer, title, body, url, quoted, options) {
                let type
                if (buffer) {
                    try {
                        type = await conn.getFile(buffer)
                        buffer = type.data
                    } catch { buffer = buffer }
                }
                const prep = generateWAMessageFromContent(jid, {
                    extendedTextMessage: {
                        text: text,
                        contextInfo: {
                            externalAdReply: { title, body, thumbnail: buffer, sourceUrl: url },
                            mentionedJid: await conn.parseMention(text)
                        }
                    }
                }, { quoted })
                return conn.relayMessage(jid, prep.message, { messageId: prep.key.id })
            }
        },

        sendNyanCat: {
            async value(jid, text = "", buffer, title, body, url, quoted, options) {
                let type
                if (buffer) {
                    try {
                        type = await conn.getFile(buffer)
                        buffer = type.data
                    } catch { buffer = buffer }
                }
                const prep = generateWAMessageFromContent(jid, {
                    extendedTextMessage: {
                        text: text,
                        contextInfo: {
                            externalAdReply: { title, body, thumbnail: buffer, sourceUrl: url },
                            mentionedJid: await conn.parseMention(text)
                        }
                    }
                }, { quoted })
                return conn.relayMessage(jid, prep.message, { messageId: prep.key.id })
            }
        },

        sendSylphy: {
            async value(jid, medias, options = {}) {
                if (typeof jid !== "string") throw new TypeError(`jid must be string`)
                for (const media of medias) {
                    if (!media.type || (media.type !== "image" && media.type !== "video"))
                        throw new TypeError(`media.type must be "image" or "video"`)
                    if (!media.data || (!media.data.url && !Buffer.isBuffer(media.data)))
                        throw new TypeError(`media.data must be object with url or buffer`)
                }
                if (medias.length < 2) throw new RangeError("Minimum 2 media")

                const delayMs = !isNaN(options.delay) ? options.delay : 500
                delete options.delay

                const album = baileys.generateWAMessageFromContent(jid, {
                    messageContextInfo: {},
                    albumMessage: {
                        expectedImageCount: medias.filter(m => m.type === "image").length,
                        expectedVideoCount: medias.filter(m => m.type === "video").length,
                        ...(options.quoted ? {
                            contextInfo: {
                                remoteJid: options.quoted.key.remoteJid,
                                fromMe: options.quoted.key.fromMe,
                                stanzaId: options.quoted.key.id,
                                participant: options.quoted.key.participant || options.quoted.key.remoteJid,
                                quotedMessage: options.quoted.message,
                            }
                        } : {})
                    }
                }, {})

                await conn.relayMessage(album.key.remoteJid, album.message, { messageId: album.key.id })

                for (let i = 0; i < medias.length; i++) {
                    const { type, data, caption } = medias[i]
                    const message = await baileys.generateWAMessage(album.key.remoteJid, {
                        [type]: data,
                        caption: caption || ""
                    }, { upload: conn.waUploadToServer })

                    message.message.messageContextInfo = {
                        messageAssociation: { associationType: 1, parentMessageKey: album.key }
                    }

                    await conn.relayMessage(message.key.remoteJid, message.message, { messageId: message.key.id })
                    await baileys.delay(delayMs)
                }
                return album
            }
        },

        sendPayment: {
            async value(jid, amount, text, quoted, options) {
                return conn.relayMessage(jid, {
                    requestPaymentMessage: {
                        currencyCodeIso4217: "PEN",
                        amount1000: amount,
                        requestFrom: null,
                        noteMessage: {
                            extendedTextMessage: {
                                text: text,
                                contextInfo: {
                                    externalAdReply: { showAdAttribution: true },
                                    mentionedJid: conn.parseMention(text)
                                }
                            }
                        }
                    }
                }, {})
            }
        },

        getFile: {
            async value(PATH, saveToFile = false) {
                let res, filename
                const data = Buffer.isBuffer(PATH) ? PATH :
                    PATH instanceof ArrayBuffer ? PATH :
                    /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], "base64") :
                    /^https?:\/\//.test(PATH) ? await (res = await fetch(PATH)).buffer() :
                    fs.existsSync(PATH) ? ((filename = PATH), fs.readFileSync(PATH)) :
                    typeof PATH === "string" ? PATH : Buffer.alloc(0)

                if (!Buffer.isBuffer(data)) throw new TypeError("Result is not a buffer")

                const type = (await fileTypeFromBuffer(data)) || { mime: "application/octet-stream", ext: ".bin" }

                if (data && saveToFile && !filename) {
                    filename = path.join(__dirname, "../tmp/" + new Date() * 1 + "." + type.ext)
                    await fs.promises.writeFile(filename, data)
                }

                return {
                    res,
                    filename,
                    ...type,
                    data,
                    deleteFile() { return filename && fs.promises.unlink(filename) }
                }
            },
            enumerable: true,
        },

        sendButtonMessages: {
            async value(jid, messages, quoted, options) {
                messages.length > 1 ?
                    await conn.sendCarousel?.(jid, messages, quoted, options) :
                    await conn.sendNCarousel?.(jid, ...messages[0], quoted, options)
            }
        },

        sendNCarousel: {
            async value(jid, text = "", footer = "", buffer, buttons, copy, urls, list, quoted, options) {
                console.log("⚠️ sendNCarousel está incompleto.")
                return conn.sendMessage(jid, { text: "sendNCarousel en desarrollo..." }, { quoted })
            }
        }
    })

    return sock
}

export function smsg(conn, m) {
    if (!m) return m
    m.conn = conn
    return m
}