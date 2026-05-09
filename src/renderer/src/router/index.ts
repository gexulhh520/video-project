import { createRouter, createWebHashHistory } from "vue-router";
import HomePage from "../pages/HomePage.vue";
import VideoToPostPage from "../pages/VideoToPostPage.vue";

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
    }
  ]
});
