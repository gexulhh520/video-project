import { createRouter, createWebHashHistory } from "vue-router";
import HomePage from "../pages/HomePage.vue";
import VideoToPostPage from "../pages/VideoToPostPage.vue";
import WebToPostPage from "../pages/WebToPostPage.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomePage
    },
    {
      path: "/tools/video-to-post",
      name: "video-to-post",
      component: VideoToPostPage
    },
    {
      path: "/tools/web-to-post",
      name: "web-to-post",
      component: WebToPostPage
    }
  ]
});
