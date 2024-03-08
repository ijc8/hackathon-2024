#include <ArduinoJson.h>
#include <ArduinoJson.hpp>
#include <WiFi.h>
#include <HTTPClient.h>

const int potPin1 = 35; // Potentiometer connected to GPIO14
const int potPin2 = 34;
const int potPin3 = 39;
const int potPin4 = 36;
const int ledPin = 26; // LED connected to GPIO26

int potValue1;
int potValue2;
int potValue3;
int potValue4;

int last_pot1_state;
int last_pot2_state;
int last_pot3_state;
int last_pot4_state;

const int buttonPin1 = 33;
const int buttonPin2 = 26;

bool button1_state;
bool last_button1_state;

bool button2_state;
bool last_button2_state;

const char* ssid = "moto g stylus (2022)_8914";
const char* password = "e7bi5enc7hv8ynh";

const char* server = "http://192.168.164.120:8000/sensors";
// const char* server = "https://jsonplaceholder.typicode.com/posts";

bool toggle1 = true;
bool toggle2 = true;

// PWM settings
// const int freq = 5000; // PWM frequency
// const int resolution = 12; // PWM resolution (bits)
// const int channel = 0; // PWM channel

void setup() {
  Serial.begin(115200);
  pinMode(buttonPin1, INPUT_PULLUP);
  pinMode(buttonPin2, INPUT_PULLUP);
  button1_state = digitalRead(buttonPin1);
  button2_state = digitalRead(buttonPin2);
  delay(4000);
  WiFi.begin(ssid, password);

  // Configure PWM
  // ledcSetup(channel, freq, resolution);
  // ledcAttachPin(ledPin, channel);

  while (WiFi.status() != WL_CONNECTED){
    delay(1000);
    Serial.println("connecting to wifi...");
  }

  Serial.println("connected to wifi network");

  Serial.print("ssid: ");
  Serial.println(ssid);

  IPAddress ip = WiFi.localIP();
  Serial.print("ip address: ");
  Serial.println(ip);
}

void loop() {
  // uint32_t voltage_mV = analogReadMilliVolts(potPin); // Read the voltage in millivolts

  last_pot1_state = potValue1;
  potValue1 = analogRead(potPin1); // read the value of the potentiometer

  last_pot2_state = potValue2;
  potValue2 = analogRead(potPin2);

  last_pot3_state = potValue3;
  potValue3 = analogRead(potPin3);

  last_pot4_state = potValue4;
  potValue4 = analogRead(potPin4);

  last_button1_state = button1_state;
  button1_state = digitalRead(buttonPin1);

  last_button2_state = button2_state;
  button2_state = digitalRead(buttonPin2);

  // if (last_button1_state == HIGH && button1_state == LOW){
  //   // Serial.println("button1 pressed");
  //   toggle1 = !toggle1;
  //   // Serial.println(toggle1);
  // } 

  // if (last_button2_state == HIGH && button2_state == LOW){
  //   // Serial.println("button2 pressed");
  //   toggle2 = !toggle2;
  //   // Serial.println(toggle2);
  // } 

  JsonDocument doc;

  doc["pot1"] = potValue1;
  doc["pot2"] = potValue2;
  doc["pot3"]= potValue3;
  doc["pot4"]= potValue4;
  doc["b1"]= button1_state;
  doc["b2"]= button2_state;

  // serializeJson(doc, Serial);

  char buffer[256];

  serializeJson(doc, buffer);

  // Serial.print("P1 Value: ");
  // Serial.println(potValue1);
  // Serial.print("P2 Value: ");
  // Serial.println(potValue2);
  // Serial.print("P3 Value: ");
  // Serial.println(potValue3);
  // Serial.print("P4 Value: ");
  // Serial.println(potValue4);

  // Serial.print(", Voltage: ");
  // Serial.print(voltage_mV / 1000.0); // Convert millivolts to volts
  // Serial.println(" V");

  if ((WiFi.status() == WL_CONNECTED)) {
    
    WiFiClient client;
    HTTPClient http;

    http.begin(client, server);
    http.addHeader("Content-Type", "application/json");

    if (last_pot1_state != potValue1 || last_pot2_state != potValue2 || last_pot3_state != potValue3 || last_pot4_state != potValue4 || last_button1_state != button1_state || last_button2_state != button2_state){
      int httpResponseCode = http.POST(buffer);
      Serial.println("something works here");
    }

    // Serial.print("http response code: ");
    // Serial.println(httpResponseCode);

    http.end();
  } else {
    Serial.println("error");
  }

  delay(100);
}