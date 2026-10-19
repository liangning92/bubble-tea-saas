FROM nginx:alpine

ARG SOURCE_SHA
LABEL org.opencontainers.image.title="LUMBA company website" \
      org.opencontainers.image.source="https://github.com/liangning92/bubble-tea-saas" \
      org.opencontainers.image.revision="${SOURCE_SHA}"

COPY company-site/nginx.conf /etc/nginx/nginx.conf
COPY company-site/public/ /usr/share/nginx/html/

USER nginx
EXPOSE 8080
ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
