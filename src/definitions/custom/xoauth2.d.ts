declare module XOAuth
{
    export interface IXOauthOptions
    {
        user: string,
        clientId: string,
        clientSecret: string,
        refreshToken: string,
        accessToken: string
    }

    export function createXOAuth2Generator(options: IXOauthOptions);
}

declare module "xoauth"
{
    export = XOAuth;
}