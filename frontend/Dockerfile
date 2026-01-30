FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Instalamos la nueva versión de tailwind y su plugin para postcss
RUN npm install tailwindcss @tailwindcss/postcss postcss autoprefixer
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]