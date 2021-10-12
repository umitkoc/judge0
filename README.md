# JUDGE0 ide 
---------------------------------------------
1-Docker install 
---------------------
2-Docker-compose install
----------------------------
3-Judge library download 
------------------------




for ubuntu:
sudo apt install docker.io
sudo apt install docker-compose 
wget https://github.com/judge0/judge0/releases/download/v1.13.0/judge0-v1.13.0.zip
unzip judge0-v1.13.0.zip
cd judge0-v1.13.0
docker-compose up -d db redis
sleep 10s
docker-compose up -d
sleep 5s
-------------------
