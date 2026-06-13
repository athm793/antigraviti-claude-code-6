import nextConfig from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**"],
  },
];

export default eslintConfig;
