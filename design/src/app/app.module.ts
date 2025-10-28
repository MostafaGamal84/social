import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { LoadingInterceptor } from './services/loading.interceptor';
import { ChatAssistantComponent } from './chat-assistant/chat-assistant.component';

@NgModule({
  declarations: [AppComponent, ChatAssistantComponent],
  imports: [BrowserModule, HttpClientModule, ReactiveFormsModule, FormsModule],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LoadingInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
