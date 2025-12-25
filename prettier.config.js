/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "tabWidth": 4,
  "useTabs": false,
  "printWidth": 100,
  "endOfLine": "lf",
  "bracketSpacing": true,
  "bracketSameLine": false,
  "arrowParens": "avoid",
  plugins: ["prettier-plugin-tailwindcss"],
};

export default config;
