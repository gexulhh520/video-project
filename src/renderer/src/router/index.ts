import { createRouter, createWebHashHistory } from "vue-router";
import HomePage from "../pages/HomePage.vue";
import ArticleRewritePage from "../pages/ArticleRewritePage.vue";
import VideoToPostPage from "../pages/VideoToPostPage.vue";
import WebToPostPage from "../pages/WebToPostPage.vue";
import ContentStudioPage from "../pages/ContentStudioPage.vue";
import HotspotRadarPage from "../pages/HotspotRadarPage.vue";
import HotspotRadarTasksPage from "../pages/HotspotRadarTasksPage.vue";
import HotspotRadarCandidatesPage from "../pages/HotspotRadarCandidatesPage.vue";
import HotspotRadarSavedPage from "../pages/HotspotRadarSavedPage.vue";
import HotspotRadarSavedDetailPage from "../pages/HotspotRadarSavedDetailPage.vue";

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
    },
    {
      path: "/tools/article-rewrite",
      name: "article-rewrite",
      component: ArticleRewritePage
    },
    {
      path: "/tools/content-studio",
      name: "content-studio",
      component: ContentStudioPage
    },
  ]
});
