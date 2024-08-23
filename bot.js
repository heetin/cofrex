const { Client, GatewayIntentBits, Events, ButtonBuilder, ButtonStyle, ActionRowBuilder, InteractionType, EmbedBuilder, AttachmentBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const CHANNEL_ID = '1275199919719714876'; // ID del canal de texto
const VOICE_CHANNEL_IDS = {
    1: '1276100802322370630', // ID del canal de voz 1
    2: '1276100879031734284', // ID del canal de voz 2
    3: '1276100802322370630', // ID del canal de voz 3
    4: '1276100897931399178', // ID del canal de voz 4
    5: '1276100992122880061'  // ID del canal de voz 5
};

let cofres = [null, null, null, null, null]; // Estado de los cofres
let colaEspera = []; // Cola de espera

client.once(Events.ClientReady, () => {
    console.log('Bot is ready!');
    sendButtonMessage(); // Envía los botones inicialmente
    setInterval(sendButtonMessage, 10 * 60 * 1000); // Reenvía los botones cada 10 minutos
    setInterval(liberarCofres, 60000); // Liberar cofres cada minuto
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (message.content === '!start') {
        const button1 = new ButtonBuilder()
            .setCustomId('cofre_button')
            .setLabel('Reclamar Cofre')
            .setStyle(ButtonStyle.Primary);

        const button2 = new ButtonBuilder()
            .setCustomId('cofres_activos_button')
            .setLabel('Cofres Activos')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(button1, button2);

        await message.reply({
            content: 'Haz clic en el botón para reclamar un cofre o para ver los cofres activos.',
            components: [row]
        });
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.type === InteractionType.MessageComponent) {
        if (interaction.customId === 'cofre_button') {
            const user = interaction.user;

            // Verificar si el usuario ya tiene un cofre asignado
            let usuarioTieneCofre = false;
            for (let i = 0; i < cofres.length; i++) {
                if (cofres[i] && cofres[i].user.id === user.id) {
                    usuarioTieneCofre = true;
                    break;
                }
            }

            if (usuarioTieneCofre) {
                await interaction.reply({ content: 'Ya tienes un cofre asignado.', ephemeral: true });
                return;
            }

            let cofreAsignado = null;
            // Buscar un cofre disponible
            for (let i = 0; i < cofres.length; i++) {
                if (cofres[i] === null) {
                    cofreAsignado = i + 1;
                    cofres[i] = { user, endTime: Date.now() + 30 * 60 * 1000 }; // 30 minutos
                    break;
                }
            }

            if (cofreAsignado !== null) {
                // Asignar canal de voz correspondiente
                const voiceChannelId = VOICE_CHANNEL_IDS[cofreAsignado];
                const voiceChannel = client.channels.cache.get(voiceChannelId);
                if (voiceChannel) {
                    try {
                        await interaction.member.voice.setChannel(voiceChannel);
                    } catch (error) {
                        console.error('Error al mover al usuario al canal de voz:', error);
                        await interaction.reply({ content: 'No se pudo mover al canal de voz.', ephemeral: true });
                        return;
                    }
                } else {
                    await interaction.reply({ content: 'Canal de voz no encontrado.', ephemeral: true });
                    return;
                }

                // Enviar mensaje con mención y foto
                const imageAttachment = new AttachmentBuilder('C:/Users/PC/Desktop/bot-ds/imagen.png'); // Ruta actualizada
                const embed = new EmbedBuilder()
                    .setTitle(`¡Cofre ${cofreAsignado} reclamado!`)
                    .setDescription(`¡Felicidades ${interaction.member.displayName}! Has reclamado el cofre ${cofreAsignado}. Tienes 30 minutos.`)
                    .setImage('attachment://imagen.png')
                    .setColor('#0099ff');

                await interaction.reply({ embeds: [embed], files: [imageAttachment] });
            } else {
                if (colaEspera.length < 10) {
                    colaEspera.push(user);
                    await interaction.reply({ content: 'Todos los cofres están ocupados. Estás en la cola de espera.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'La cola de espera está llena. Intenta más tarde.', ephemeral: true });
                }
            }
        } else if (interaction.customId === 'cofres_activos_button') {
            const embed = new EmbedBuilder()
                .setTitle('Cofres Activos')
                .setColor('#0099ff')
                .setDescription('Aquí está el estado de los cofres y la lista de espera.');

            for (let i = 0; i < cofres.length; i++) {
                const cofre = cofres[i];
                if (cofre === null) {
                    embed.addFields({ name: `Cofre ${i + 1}`, value: 'Libre', inline: true });
                } else {
                    const remainingTime = Math.max(0, Math.floor((cofre.endTime - Date.now()) / 60000)); // Tiempo restante en minutos
                    embed.addFields({ name: `Cofre ${i + 1}`, value: `${interaction.member.displayName} ${remainingTime} minutos`, inline: true });
                }
            }

            if (colaEspera.length > 0) {
                embed.addFields({ name: 'Cola de Espera', value: colaEspera.map(user => user.username).join(', ') || 'Vacía', inline: false });
            } else {
                embed.addFields({ name: 'Cola de Espera', value: 'Vacía', inline: false });
            }

            await interaction.reply({ embeds: [embed] });
        }
    }
});

async function liberarCofres() {
    for (let i = 0; i < cofres.length; i++) {
        if (cofres[i] && Date.now() >= cofres[i].endTime) {
            const user = cofres[i].user;
            const voiceChannelId = VOICE_CHANNEL_IDS[i + 1];
            const voiceChannel = client.channels.cache.get(voiceChannelId);

            cofres[i] = null;
            // Notificar al usuario que su tiempo ha terminado
            await user.send(`Tu tiempo en el cofre ${i + 1} ha terminado.`);

            // Intentar mover al usuario del canal de voz
            if (voiceChannel) {
                try {
                    const member = voiceChannel.members.find(m => m.id === user.id);
                    if (member) {
                        await member.voice.disconnect(); // Desconectar al usuario del canal de voz
                    }
                } catch (error) {
                    console.error('Error al expulsar al usuario del canal de voz:', error);
                }
            }

            // Asignar el cofre al siguiente en la cola de espera
            if (colaEspera.length > 0) {
                const siguienteUsuario = colaEspera.shift();
                cofres[i] = { user: siguienteUsuario, endTime: Date.now() + 30 * 60 * 1000 }; // 30 minutos
                // Asignar canal de voz
                if (voiceChannel) {
                    try {
                        await siguienteUsuario.voice.setChannel(voiceChannel);
                        await siguienteUsuario.send(`¡Cofre ${i + 1} asignado! Tienes 30 minutos.`);
                    } catch (error) {
                        console.error('Error al mover al usuario al canal de voz:', error);
                    }
                }
            }
        }
    }
}

async function sendButtonMessage() {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (channel && channel.isTextBased()) {
        const button1 = new ButtonBuilder()
            .setCustomId('cofre_button')
            .setLabel('Reclamar Cofre')
            .setStyle(ButtonStyle.Primary);

        const button2 = new ButtonBuilder()
            .setCustomId('cofres_activos_button')
            .setLabel('Cofres Activos')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(button1, button2);

        await channel.send({
            content: 'Haz clic en el botón para reclamar un cofre o para ver los cofres activos.',
            components: [row]
        });
    } else {
        console.error('El canal de texto no fue encontrado.');
    }
}

client.login(process.env.TOKEN);
