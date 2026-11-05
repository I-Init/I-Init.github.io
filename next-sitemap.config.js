/**
 * @type {import('next-sitemap').IConfig}
 */
module.exports = {
  siteUrl: 'https://i-init.github.io',
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [{ userAgent: '*', allow: '/' }],
  },
};
