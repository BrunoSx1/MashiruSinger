const { Client, GatewayIntentBits } = require('discord.js');

require('dotenv').config();
const token = process.env.DISCORD_TOKEN;


const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const ytdl = require('ytdl-core');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const queue = new Map();

client.once('ready', () => {
    console.log('Bot está online!');
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const serverQueue = queue.get(message.guild.id);

    if (message.content.startsWith('n!play')) {
        const args = message.content.split(' ');
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.channel.send('Você precisa estar em um canal de voz para tocar música!');

        const permissions = voiceChannel.permissionsFor(message.client.user);
        if (!(permissions.bitfield & BigInt(1) << BigInt(14)) || !(permissions.bitfield & BigInt(1) << BigInt(15))) {
    return message.channel.send('Eu preciso das permissões para entrar e falar no seu canal de voz!');
}

        const songInfo = await ytdl.getInfo(args[1]);
        const song = {
            title: songInfo.videoDetails.title,
            url: songInfo.videoDetails.video_url,
        };

        if (!serverQueue) {
            const queueContruct = {
                textChannel: message.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 5,
                playing: true,
            };

            queue.set(message.guild.id, queueContruct);
            queueContruct.songs.push(song);

            try {
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });
                queueContruct.connection = connection;
                play(message.guild, queueContruct.songs[0]);
            } catch (err) {
                console.log(err);
                queue.delete(message.guild.id);
                return message.channel.send(err.message || 'Ocorreu um erro ao conectar-se ao canal de voz.');
            }
        } else {
            serverQueue.songs.push(song);
            return message.channel.send(`${song.title} foi adicionado à fila!`);
        }
    } else if (message.content.startsWith('n!skip')) {
        if (!message.member.voice.channel) return message.channel.send('Você precisa estar em um canal de voz para pular a música!');
        if (!serverQueue) return message.channel.send('Não há música que eu possa pular!');
        serverQueue.songs.shift();
        play(message.guild, serverQueue.songs[0]);
    } else if (message.content.startsWith('n!stop')) {
        if (!message.member.voice.channel) return message.channel.send('Você precisa estar em um canal de voz para parar a música!');
        serverQueue.songs = [];
        getVoiceConnection(message.guild.id).disconnect();
    }
});

function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const player = createAudioPlayer();
    const resource = createAudioResource(ytdl(song.url, { filter: 'audioonly', highWaterMark: 1<<25 }), { inlineVolume: true });
    resource.volume.setVolume(serverQueue.volume / 5);
    player.play(resource);
    serverQueue.connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
    });

    serverQueue.textChannel.send(`Tocando agora: **${song.title}**`);
}

client.login(token);
