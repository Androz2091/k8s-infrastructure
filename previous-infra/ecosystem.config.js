module.exports = {
    apps: [
// manage-invite
        {
            name: "manage-invite-bot",
            script: "sharder.js",
            cwd: "./manage-invite/manage-invite-bot"
        },
        {
            name: "manage-invite-api",
            script: "dist/index.js",
            cwd: "./manage-invite/manage-invite-api"
        },
        {
            name: "manage-invite-support",
            script: "index.js",
            cwd: "./manage-invite/manage-invite-support"
        },
        {
            name: "manage-invite-dash-redirects",
            script: "index.js",
            cwd: "./manage-invite/manage-invite-dash-redirects"
        },
// custom bots
	{
	    name: "androz-dev-bot",
	    script: "index.js",
	    cwd: "./perso-bots/AndrozDevBot"
	},/*
	{
	    name: "pronote-pushover",
	    script: "index.js",
	    cwd: "./perso-bots/pronote-pushover"
	},/*
	{
            name: "switz-pushover",
            script: "index.js",
            cwd: "./perso-bots/find-a-host-in-switzerland"
        },*/
// custom services
	{
	    name: "haste-server",
	    script: "server.js",
	    cwd: "./services/haste-server"
	},
	{
	    name: "umami",
//	    exec_interpreter: "/home/debian/.nvm/versions/node/v14.21.2/bin/node",
	    script: "scripts/start-env.js",
	    cwd: "./services/umami"
	},
	{
            name: "twittycord",
            script: "dist/server.js",
            cwd: "./services/twittycord"
        },
	{
	    name: "diswho",
            interpreter: "deno",
	    interpreterArgs: "run --allow-net --allow-read --allow-env",
	    script: "mod.js",
            cwd: "./services/deno-diswho"
	},/*
	{
	    name: "sleepingmoney-pushover",
	    interpreter: "deno",
	    interpreterArgs: "run --allow-net --allow-read --allow-write --allow-env",
		script: "mod.js",
		cwd: "./services/sleepingmoney-pushover"
	},*/
// customers
/*
	{
	    name: "stoicpresale",
	    script: "server.js",
	    cwd: "./customers-bots/stoicdao-wallet-submit/back"
	},
*/
	{
                name: "music-cat-discord-bot",
                script: "dist/index.js",
                cwd: "./customers-bots/music-cat-discord-bot"
        },
	{
		name: "simpletrading-community-bot",
                script: "dist/index.js",
                cwd: "./customers-bots/simpletrading-community-bot"
	},
	{
                name: "what-is-life-discord-bot",
                script: "dist/index.js",
                cwd: "./customers-bots/what-is-life-discord-bot"
        },
	{
                name: "wheel-discord-bot",
                script: "index.js",
                cwd: "./customers-bots/wheel-discord-bot"
        },/*
	{
		name: "3dapes-bucks",
		script: "dist/index.js",
		cwd: "./customers-bots/3dapes-bucks"
	},
	{
		name: "pokemons-discord-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/pokemons-discord-bot"
	},
	{
		name: "xrpl-discord-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/xrpl-discord-bot"
	},
	{
		name: "helper-3dapes-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/helper-3dapes-bot"
	},*/
	{
		name: "discordsopli-discord-bot",
		script: "index.js",
		cwd: "./customers-bots/discordsopli-discord-bot"
	},
	{
                name: "blockfella-discord-bot",
                script: "dist/index.js",
                cwd: "./customers-bots/blockfella-discord-bot"
        },/*
	{
	    name: "dragons-prophet-bot",
		script: "index.js",
		cwd: "./customers-bots/dragons-prophet-bot"
	},*/
	{
	    name: "evolution-markets-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/evolution-markets-bot"
	},
	{
	    name: "fractal-markets-bot",
	    script: "dist/index.js",
	    cwd: "./customers-bots/fractal-markets-bot"
	},
	{
		name: "kryptview-discord-bot",
		script: "dist/index.js",
	    cwd: "./customers-bots/kryptview-discord-bot"
	},
	{
		name: "kryptview-community",
		script: "dist/index.js",
	    cwd: "./customers-bots/kryptview-community"
	},
	{
                name: "forward-wh-discord-bot",
                script: "index.js",
           	 cwd: "./customers-bots/forward-wh-discord-bot"
        },
	{
		name: "netflix-discord-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/netflix-discord-bot"
	},/*¨
	{
		name: "opm-partners-api",
		script: "dist/index.js",
		cwd: "./customers-bots/opm-partners-api"
	},*/
	{
		name: "pokercode-discord-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/pokercode-discord-bot"
	},
	{
		name: "pokercode-quiz-discord-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/pokercode-quiz-discord-bot"
	},
/*
	{
		name: "stoicdao-discord-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/stoicdao-discord-bot"
	},
	{
		name: "supermeta-plus-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/supermeta-plus-bot"
	},/*
	{
                name: "copywriting-discord-bot",
                script: "index.js",
                cwd: "./customers-bots/copywriting-discord-bot"
        },
/*        {
                name: "cow-cow-discord-bot",
                script: "dist/index.js",
                cwd: "./customers-bots/cow-cow-discord-bot"
        },
*/	{
                name: "tpfisher-wholesale-bot",
                script: "dist/index.js",
                cwd: "./customers-bots/tpfisher-wholesale-bot"
        },
	{
	        name: "cnft-discord-bot",
		script: "index.js",
		cwd: "./customers-bots/cnft-discord-bot"
	},
/*	{
		name: "coindraw-wheel-discord-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/coindraw-wheel-discord-bot"
	},
*//*	{
                name: "goldstar-discord-bot",
                script: "index.js",
                cwd: "./customers-bots/goldstar-discord-bot"
        },
*/	{
                name: "kolc-discord-bot",
                script: "dist/index.js",
                cwd: "./customers-bots/knights-of-last-call-discord-bot"
        },
	{
                name: "doc-customgpt-discord-bot",
                script: "index.js",
                cwd: "./customers-bots/customgpt-discord-bot"
        },
        { 
                name: "10mans-discord-bot",
                script: "dist/index.js",
                cwd: "./customers-bots/10mans-discord-bot"
        },/*
	{
		name: "lapiz-legion-discord-bot",
		script: "dist/index.js",
		cwd: "./customers-bots/lapiz-legion-discord-bot"
	},
	/*
	// shutdown on 22 dec. 2022 --> invalid token and no longer access to teams, seems to be useless even if sub is paid
	{
		name: "helper-3dapes-bot",
		script: "dist/index.js",
	    cwd: "./customers-bots/helper-3dapes-bot"
	},
	*/
	/*{
	    name: "kaisea",
            script: "dist/index.js",
            cwd: "./customers-bots/kaisea"
	},
	{
            name: "cryptagency-twitter-bot",
            script: "dist/index.js",
            cwd: "./customers-bots/cryptagency-twitter-bot"
        },
	{
	    name: "kalpha-twitter-bot",
	    script: "dist/index.js",
	    cwd: "./customers-bots/kalpha-twitter-bot"
	}*/
	{
	    name: "sshception",
	    script: "main.js",
	    cwd: "./services/synced-over-ssh"
	}
    ]
}

