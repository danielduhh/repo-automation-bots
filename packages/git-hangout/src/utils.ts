import {chat_v1, Auth, google} from 'googleapis'
const auth = new Auth.GoogleAuth({
  scopes: 'https://www.googleapis.com/auth/chat.bot'
})


export interface Configuration {
  CHAT_WEBHOOK_URL?: string;
}

export const createColorText = (colorCode: string, text: string) => {
  return `<font color=${'#' + colorCode}>${text}</font>`;
};

export const truncateText = (text: string, maxCharacters = 255) => {
  return `${text.slice(0, maxCharacters)}...`;
};

export const createGithubButton = (url: string) => {
  return {
    textButton: {
      text: 'OPEN IN GITHUB',
      onClick: {
        openLink: {
          url: url,
        },
      },
    },
  };
};

export const getCardHeader = (event = '', repository = '') => {
  return {
    title: `Github Event Delivery: ${event}`,
    subtitle: `${repository}`,
    imageUrl:
      'https://github.githubassets.com/images/modules/logos_page/Octocat.png',
    imageStyle: 'IMAGE',
  };
};

export const getChatClient = async () => {
  let authClient;
  let chatClient;

  try {
    authClient = await auth.getClient();
    chatClient = new chat_v1.Chat({auth: authClient})
  } catch (error) {
    throw new Error("Unable to Authenticate with Chat API.")
  }
  // google.options({auth: authClient})
  return chatClient
}