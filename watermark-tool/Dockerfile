# Dockerfile (place inside watermark-tool/)
FROM node:18-bullseye

# Install system deps + ghostscript + python3 + pip dependencies for OpenCV/PyMuPDF
RUN apt-get update && apt-get install -y \
    python3 python3-pip ghostscript build-essential libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# copy node package files then install npm deps
COPY package*.json ./
RUN npm install --production

# copy rest of the tool
COPY . .

# install python requirements
RUN python3 -m pip install --upgrade pip
RUN if [ -f requirements.txt ]; then python3 -m pip install -r requirements.txt; fi

EXPOSE 5002
CMD ["node", "server.js"]
